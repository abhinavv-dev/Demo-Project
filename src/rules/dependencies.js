'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const {
  exists,
  readJsonFile,
  walkFiles,
  extractImportSpecifiers,
  analyzeDynamicImports,
  isPackageReferencedDynamically,
  getPackageNameFromSpecifier,
  findWorkspaceRoot,
  getWorkspacePackageNames,
  isPackageReferencedInScripts
} = require('../utils/fs');

const KNOWN_LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml'
];

const dependenciesRule = {
  name: 'dependencies',
  category: 'dependencies',
  description: 'Inspects project dependencies, lockfiles, and package integrity',

  /**
   * Run the dependency diagnostic check.
   *
   * @param {Object} context
   * @param {string} context.projectRoot
   * @param {Map<string, string[]>} [context.fileCache]
   * @returns {Promise<Array<Object>>}
   */
  async run(context = {}) {
    const { projectRoot, fileCache } = context;
    const findings = [];
    const pkgPath = path.join(projectRoot, 'package.json');

    let pkg;
    try {
      const parsed = await readJsonFile(pkgPath);
      pkg = parsed.content;
    } catch {
      // If package.json is missing or unparseable, configuration rule handles it
      return findings;
    }

    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
      return findings;
    }

    // 1. Check Package Metadata for invalid or missing dependency structures
    const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const field of depFields) {
      if (pkg[field] !== undefined) {
        if (typeof pkg[field] !== 'object' || pkg[field] === null || Array.isArray(pkg[field])) {
          findings.push({
            id: 'DEP001',
            category: 'dependencies',
            severity: 'error',
            title: `Invalid ${field} definition`,
            message: `The "${field}" field in package.json is not a valid object.`,
            file: 'package.json',
            recommendation: `Ensure "${field}" in package.json is a key-value mapping of package names to version strings.`,
            fixable: false
          });
        }
      }
    }

    // 2. Check for empty or invalid version strings
    const declaredDeps = {};
    const declaredDevDeps = {};

    if (pkg.dependencies && typeof pkg.dependencies === 'object' && !Array.isArray(pkg.dependencies)) {
      for (const [name, version] of Object.entries(pkg.dependencies)) {
        declaredDeps[name] = version;
        if (typeof version !== 'string' || version.trim() === '') {
          findings.push({
            id: 'DEP002',
            category: 'dependencies',
            severity: 'error',
            title: 'Invalid dependency version',
            message: `Dependency "${name}" has an empty or invalid version string.`,
            file: 'package.json',
            recommendation: `Specify a valid version range for "${name}" in dependencies.`,
            fixable: false
          });
        }
      }
    }

    if (pkg.devDependencies && typeof pkg.devDependencies === 'object' && !Array.isArray(pkg.devDependencies)) {
      for (const [name, version] of Object.entries(pkg.devDependencies)) {
        declaredDevDeps[name] = version;
        if (typeof version !== 'string' || version.trim() === '') {
          findings.push({
            id: 'DEP002',
            category: 'dependencies',
            severity: 'error',
            title: 'Invalid devDependency version',
            message: `DevDependency "${name}" has an empty or invalid version string.`,
            file: 'package.json',
            recommendation: `Specify a valid version range for "${name}" in devDependencies.`,
            fixable: false
          });
        }
      }
    }

    // Check if this project is part of a monorepo workspace
    const workspaceRoot = await findWorkspaceRoot(projectRoot);
    let workspacePackages = new Set();
    if (workspaceRoot) {
      workspacePackages = await getWorkspacePackageNames(workspaceRoot);
    } else if (pkg.workspaces) {
      // Current project is itself the monorepo root
      workspacePackages = await getWorkspacePackageNames(projectRoot);
    }

    // 3. Check for Lockfile Consistency
    const hasAnyDeps = Object.keys(declaredDeps).length > 0 || Object.keys(declaredDevDeps).length > 0;
    if (hasAnyDeps) {
      let foundLockfile = false;
      // Check local lockfile first
      for (const lockfile of KNOWN_LOCKFILES) {
        if (await exists(path.join(projectRoot, lockfile))) {
          foundLockfile = true;
          break;
        }
      }

      // If not found locally, check workspace root lockfile if inside a monorepo workspace
      if (!foundLockfile && workspaceRoot) {
        for (const lockfile of KNOWN_LOCKFILES) {
          if (await exists(path.join(workspaceRoot, lockfile))) {
            foundLockfile = true;
            break;
          }
        }
      }

      if (!foundLockfile) {
        findings.push({
          id: 'DEP003',
          category: 'dependencies',
          severity: 'warning',
          title: 'Missing dependency lockfile',
          message: 'Dependencies are declared in package.json, but no lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml) was found.',
          file: null,
          recommendation: 'Generate a lockfile by running your package manager install command (e.g. npm install, yarn install, or pnpm install).',
          fixable: false
        });
      }
    }

    // 4. Missing Dependencies (Declared in dependencies or devDependencies, but absent from node_modules)
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    const hasNodeModules = await exists(nodeModulesPath);

    const rootNodeModulesPath = workspaceRoot ? path.join(workspaceRoot, 'node_modules') : null;
    const hasRootNodeModules = rootNodeModulesPath ? await exists(rootNodeModulesPath) : false;

    // Combine dependencies and devDependencies to check for installation
    const allExpected = { ...declaredDeps, ...declaredDevDeps };

    for (const [depName, version] of Object.entries(allExpected)) {
      // Skip empty or invalid version definitions that were already flagged
      if (typeof version !== 'string' || version.trim() === '') {
        continue;
      }

      // Check if installed locally in project's node_modules
      const depParts = depName.split('/');
      let isInstalled = hasNodeModules && (await exists(path.join(nodeModulesPath, ...depParts)));

      // If not installed locally, check hoisted root node_modules for monorepos
      if (!isInstalled && hasRootNodeModules) {
        isInstalled = await exists(path.join(rootNodeModulesPath, ...depParts));
      }

      // Also check if dependency is another local package in the monorepo
      if (!isInstalled && workspacePackages.has(depName)) {
        isInstalled = true;
      }

      if (!isInstalled) {
        findings.push({
          id: 'DEP004',
          category: 'dependencies',
          severity: 'error',
          title: 'Missing installed dependency',
          message: `Package "${depName}" is declared in package.json but is not installed in node_modules.`,
          file: 'package.json',
          recommendation: `Install missing dependencies by running your package manager (e.g. npm install).`,
          fixable: false
        });
      }
    }

    // 5. Unused Dependency Candidates (only declared in production dependencies, strictly excluding devDependencies)
    const prodDepNames = Object.keys(declaredDeps).filter(name => {
      return !name.startsWith('@types/');
    });

    if (prodDepNames.length > 0) {
      const sourceFiles = await walkFiles(projectRoot, {
        extensions: new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx']),
        fileCache
      });

      const referencedPackages = new Set();
      const allDynamicPrefixes = new Set();
      let hasGlobalUnknownDynamic = false;

      for (const file of sourceFiles) {
        try {
          const content = await fsp.readFile(file, 'utf8');

          // Static specifier extraction
          const specifiers = extractImportSpecifiers(content);
          for (const specifier of specifiers) {
            const pkgName = getPackageNameFromSpecifier(specifier);
            if (pkgName) {
              referencedPackages.add(pkgName);
            }
          }

          // Dynamic import analysis
          const dynamicAnalysis = analyzeDynamicImports(content);
          if (dynamicAnalysis.hasUnknownDynamic) {
            hasGlobalUnknownDynamic = true;
          }
          for (const prefix of dynamicAnalysis.packagePrefixes) {
            allDynamicPrefixes.add(prefix);
          }
        } catch {
          // Ignore read errors for individual files
        }
      }

      const scripts = pkg.scripts || {};

      for (const depName of prodDepNames) {
        // Skip if directly referenced in source code
        if (referencedPackages.has(depName)) {
          continue;
        }

        // Skip if referenced in npm scripts
        if (isPackageReferencedInScripts(scripts, depName)) {
          continue;
        }

        // In monorepos, skip if this dependency matches a workspace package
        if (workspacePackages.has(depName)) {
          continue;
        }

        // If matched by a dynamic package prefix (e.g. require('plugin-' + x) matches 'plugin-alpha')
        if (isPackageReferencedDynamically(depName, allDynamicPrefixes)) {
          continue;
        }

        // If unknown computed dynamic imports exist (e.g. require(variable)), conservatively skip
        if (hasGlobalUnknownDynamic) {
          continue;
        }

        findings.push({
          id: 'DEP005',
          category: 'dependencies',
          severity: 'info',
          title: 'Unused dependency candidate',
          message: `Dependency "${depName}" is declared in package.json but does not appear to be directly imported in scanned source files. Note: dynamically loaded dependencies or plugin packages may not be detected.`,
          file: 'package.json',
          recommendation: `Verify if "${depName}" is still required by the project. If unused, remove it with "npm uninstall ${depName}".`,
          fixable: false
        });
      }
    }

    return findings;
  }
};

module.exports = dependenciesRule;
