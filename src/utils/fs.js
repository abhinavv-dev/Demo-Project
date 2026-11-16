'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const mod = require('node:module');
const { execFileSync } = require('node:child_process');

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  'dist',
  'build',
  '.nyc_output',
  '.cache',
  '.idea',
  '.vscode'
]);

const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.json']);

const BUILTIN_MODULES = new Set(mod.builtinModules || []);

/**
 * Check if a file or directory exists safely.
 *
 * @param {string} targetPath
 * @returns {Promise<boolean>}
 */
async function exists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize file path separators to POSIX forward slashes.
 *
 * @param {string} filePath
 * @returns {string}
 */
function toPosixPath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return filePath;
  }
  return filePath.replace(/\\/g, '/');
}

/**
 * Safely parse a JSON file.
 * Returns null if file does not exist, or throws SyntaxError if invalid.
 *
 * @param {string} filePath
 * @returns {Promise<{ content: any, raw: string }>}
 */
async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  const content = JSON.parse(raw);
  return { content, raw };
}

/**
 * Read text file safely, returning empty string or null on failure.
 *
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readTextFile(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Check whether a module name is a built-in Node.js module (e.g. 'fs', 'node:fs', 'path', 'node:test').
 *
 * @param {string} name
 * @returns {boolean}
 */
function isNodeBuiltin(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  if (name.startsWith('node:')) {
    return true;
  }
  if (typeof mod.isBuiltin === 'function') {
    return mod.isBuiltin(name);
  }
  return BUILTIN_MODULES.has(name);
}

/**
 * Strip single-line and multi-line comments from JavaScript/TypeScript source code.
 *
 * @param {string} code
 * @returns {string}
 */
function stripComments(code) {
  if (!code || typeof code !== 'string') {
    return '';
  }
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
}

/**
 * Walk directory recursively while ignoring specified directories, preventing symlink loops,
 * and restricting traversal within the project root.
 *
 * @param {string} dir
 * @param {Object} [options]
 * @param {Set<string>} [options.ignoreDirs]
 * @param {Set<string>} [options.extensions]
 * @param {Set<string>} [options.visited]
 * @param {Set<string>} [options.visitedFiles]
 * @param {string} [options.rootReal]
 * @param {Map<string, string[]>} [options.fileCache] - Per-run cache for memoizing file scans.
 * @returns {Promise<string[]>} List of absolute file paths with normalized paths.
 */
async function walkFiles(dir, options = {}) {
  const ignoreDirs = options.ignoreDirs || DEFAULT_IGNORE_DIRS;
  const extensions = options.extensions || null;
  const visited = options.visited || new Set();
  const visitedFiles = options.visitedFiles || new Set();

  let rootReal = options.rootReal;
  if (!rootReal) {
    try {
      rootReal = await fsp.realpath(dir);
    } catch {
      return [];
    }
  }

  // If a fileCache is provided and we are at the top-level directory call
  const cacheKey = extensions ? [...extensions].sort().join(',') : '*';
  if (options.fileCache && !options.visited && options.fileCache.has(cacheKey)) {
    // Return a shallow copy so callers cannot mutate the internal cache
    return [...options.fileCache.get(cacheKey)];
  }

  const results = [];

  let realPath;
  try {
    realPath = await fsp.realpath(dir);
  } catch {
    return results;
  }

  // Security: Do not traverse outside the target project root
  if (realPath !== rootReal && !realPath.startsWith(rootReal + path.sep)) {
    return results;
  }

  if (visited.has(realPath)) {
    return results;
  }
  visited.add(realPath);

  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    // EACCES, EPERM, or directory removed mid-scan: return empty gracefully
    return results;
  }

  for (const entry of entries) {
    const entryName = entry.name;
    const fullPath = path.join(dir, entryName);

    try {
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entryName) && !entryName.startsWith('.git')) {
          const subFiles = await walkFiles(fullPath, {
            ignoreDirs,
            extensions,
            visited,
            visitedFiles,
            rootReal
          });
          results.push(...subFiles);
        }
      } else if (entry.isSymbolicLink()) {
        try {
          const stat = await fsp.stat(fullPath);
          const linkReal = await fsp.realpath(fullPath);

          // Only follow symlinks pointing inside the project root
          if (linkReal === rootReal || linkReal.startsWith(rootReal + path.sep)) {
            if (stat.isDirectory()) {
              if (!ignoreDirs.has(entryName) && !entryName.startsWith('.git')) {
                const subFiles = await walkFiles(fullPath, {
                  ignoreDirs,
                  extensions,
                  visited,
                  visitedFiles,
                  rootReal
                });
                results.push(...subFiles);
              }
            } else if (stat.isFile()) {
              if (!visitedFiles.has(linkReal)) {
                visitedFiles.add(linkReal);
                const ext = path.extname(entryName);
                if (!extensions || extensions.has(ext)) {
                  results.push(fullPath);
                }
              }
            }
          }
        } catch {
          // Skip broken symlinks, permission errors, or targets outside root
        }
      } else if (entry.isFile()) {
        let fileReal = fullPath;
        try {
          fileReal = await fsp.realpath(fullPath);
        } catch {
          // Keep fullPath
        }

        if (!visitedFiles.has(fileReal)) {
          visitedFiles.add(fileReal);
          const ext = path.extname(entryName);
          if (!extensions || extensions.has(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip files that encounter filesystem errors during stat/check
    }
  }

  if (options.fileCache && !options.visited) {
    // Store a shallow copy in cache
    options.fileCache.set(cacheKey, [...results]);
  }

  return results;
}

/**
 * Collect all tracked files from git if repository is available.
 * Returns null if Git is not installed or repo is not a git repository.
 *
 * @param {string} projectRoot
 * @returns {string[]|null} Relative paths of tracked files or null.
 */
function getGitTrackedFiles(projectRoot) {
  try {
    const output = execFileSync('git', ['ls-files'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    return output.split('\n').filter(Boolean).map(toPosixPath);
  } catch {
    return null;
  }
}

/**
 * Parse an .env or .env.example file into a Set of variable names.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
function parseEnvKeys(content) {
  const keys = new Set();
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

/**
 * Scan source files to extract referenced process.env variable names.
 * Matches process.env.VAR and process.env['VAR'] or process.env["VAR"].
 *
 * @param {string[]} filePaths
 * @param {string} projectRoot
 * @returns {Promise<Map<string, Set<string>>>} Map of varName -> Set of relative file paths.
 */
async function extractEnvReferences(filePaths, projectRoot) {
  const envRefs = new Map();
  const dotPattern = /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  const bracketPattern = /\bprocess\.env\[['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\]/g;

  for (const filePath of filePaths) {
    let content;
    try {
      content = await fsp.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const relPath = toPosixPath(path.relative(projectRoot, filePath));
    let match;

    dotPattern.lastIndex = 0;
    while ((match = dotPattern.exec(content)) !== null) {
      const varName = match[1];
      if (!envRefs.has(varName)) {
        envRefs.set(varName, new Set());
      }
      envRefs.get(varName).add(relPath);
    }

    bracketPattern.lastIndex = 0;
    while ((match = bracketPattern.exec(content)) !== null) {
      const varName = match[1];
      if (!envRefs.has(varName)) {
        envRefs.set(varName, new Set());
      }
      envRefs.get(varName).add(relPath);
    }
  }

  return envRefs;
}

/**
 * Extract imported/required module names from JS/TS source code.
 * Ignores comments and extracts static imports/requires.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
function extractImportSpecifiers(content) {
  const specifiers = new Set();
  if (!content || typeof content !== 'string') {
    return specifiers;
  }

  const cleanCode = stripComments(content);

  // require('specifier') or require("specifier")
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requireRegex.exec(cleanCode)) !== null) {
    specifiers.add(match[1]);
  }

  // import ... from 'specifier' or import 'specifier'
  const importRegex = /\bimport\s*(?:(?:[\w*\s{},]*)\s*from\s*)?['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(cleanCode)) !== null) {
    specifiers.add(match[1]);
  }

  // dynamic import('specifier') or import("specifier")
  const dynamicImportRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(cleanCode)) !== null) {
    specifiers.add(match[1]);
  }

  // export ... from 'specifier'
  const exportRegex = /\bexport\s*(?:[\w*\s{},]*)\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = exportRegex.exec(cleanCode)) !== null) {
    specifiers.add(match[1]);
  }

  return specifiers;
}

/**
 * Check if the given source code contains computed dynamic imports or requires.
 * Returns details about whether unknown expressions (e.g. require(variable)) or
 * string/template prefixes (e.g. require('plugin-' + name)) were discovered.
 *
 * @param {string} content
 * @returns {{ hasUnknownDynamic: boolean, packagePrefixes: Set<string> }}
 */
function analyzeDynamicImports(content) {
  const packagePrefixes = new Set();
  let hasUnknownDynamic = false;

  if (!content || typeof content !== 'string') {
    return { hasUnknownDynamic, packagePrefixes };
  }

  const cleanCode = stripComments(content);

  // Match all require(...) or import(...) call patterns
  const callRegex = /\b(?:import|require)\s*\(\s*([^)]+)\)/g;
  let match;
  while ((match = callRegex.exec(cleanCode)) !== null) {
    const rawArg = match[1].trim();

    // 1. Literal static strings: e.g. require("lodash") or import('./file.js')
    if (/^["'][^"'\r\n]+["']$/.test(rawArg)) {
      continue;
    }

    // 2. Starts with a string or template literal prefix: e.g. require("plugin-" + x) or import(`@scope/pkg-${name}`)
    const prefixMatch = rawArg.match(/^[`"']([@a-zA-Z0-9_\-\.\/]+)/);
    if (prefixMatch) {
      const prefix = prefixMatch[1];
      // If the prefix starts with '.' or '/', it is an internal local file import (e.g. './modules/' or '../plugins/')
      if (!prefix.startsWith('.') && !prefix.startsWith('/')) {
        packagePrefixes.add(prefix);
      }
    } else {
      // 3. Computed variable or function call: e.g. require(variable), import(getModule())
      hasUnknownDynamic = true;
    }
  }

  return { hasUnknownDynamic, packagePrefixes };
}

/**
 * Check if a package matches dynamic import package prefixes.
 *
 * @param {string} pkgName
 * @param {Set<string>} packagePrefixes
 * @returns {boolean}
 */
function isPackageReferencedDynamically(pkgName, packagePrefixes) {
  if (!pkgName || !packagePrefixes || packagePrefixes.size === 0) {
    return false;
  }
  for (const prefix of packagePrefixes) {
    if (prefix.startsWith('.') || prefix.startsWith('/')) {
      continue;
    }
    const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_\-@/]/g, '');
    if (cleanPrefix && (pkgName.startsWith(cleanPrefix) || cleanPrefix.startsWith(pkgName))) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize an import specifier to its package name (e.g. '@scoped/pkg/foo' -> '@scoped/pkg', 'lodash/get' -> 'lodash').
 * Returns null if specifier is relative, absolute, or a native Node.js built-in module.
 *
 * @param {string} specifier
 * @returns {string|null}
 */
function getPackageNameFromSpecifier(specifier) {
  if (!specifier || typeof specifier !== 'string') {
    return null;
  }
  const trimmed = specifier.trim();
  if (trimmed.startsWith('.') || trimmed.startsWith('/') || isNodeBuiltin(trimmed)) {
    return null;
  }
  const parts = trimmed.split('/');
  let pkgName;
  if (trimmed.startsWith('@')) {
    if (parts.length >= 2) {
      pkgName = `${parts[0]}/${parts[1]}`;
    } else {
      pkgName = trimmed;
    }
  } else {
    pkgName = parts[0];
  }

  // Final check: if extracted base package name is a Node.js built-in (e.g. 'fs' from 'fs/promises')
  if (isNodeBuiltin(pkgName)) {
    return null;
  }

  return pkgName;
}

/**
 * Locate the monorepo / workspace root by walking up from the current directory,
 * verifying that the target directory actually matches the parent's declared workspace patterns.
 * Returns null if the project is not a member of a parent workspace.
 *
 * @param {string} startDir
 * @returns {Promise<string|null>}
 */
async function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);
  const { root } = path.parse(current);

  while (current && current !== root) {
    const parent = path.dirname(current);
    if (!parent || parent === current) {
      break;
    }
    const parentPkgPath = path.join(parent, 'package.json');
    try {
      const raw = await fsp.readFile(parentPkgPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        let patterns = [];
        if (Array.isArray(data.workspaces)) {
          patterns = data.workspaces.filter(p => typeof p === 'string');
        } else if (data.workspaces && typeof data.workspaces === 'object' && Array.isArray(data.workspaces.packages)) {
          patterns = data.workspaces.packages.filter(p => typeof p === 'string');
        }

        if (patterns.length > 0) {
          const relFromParent = toPosixPath(path.relative(parent, startDir));
          // Verify that startDir is actually covered by the parent's workspace patterns
          let matchesPattern = false;
          for (const pattern of patterns) {
            const normPat = toPosixPath(pattern).replace(/^\.\//, '');
            if (normPat.endsWith('/*')) {
              const base = normPat.slice(0, -2);
              if (relFromParent.startsWith(base + '/') && !relFromParent.slice(base.length + 1).includes('/')) {
                matchesPattern = true;
                break;
              }
            } else if (normPat.endsWith('/**')) {
              const base = normPat.slice(0, -3);
              if (relFromParent.startsWith(base + '/')) {
                matchesPattern = true;
                break;
              }
            } else if (relFromParent === normPat) {
              matchesPattern = true;
              break;
            }
          }

          if (matchesPattern) {
            return parent;
          }
        }
      }
    } catch {
      // Continue walking up
    }
    current = parent;
  }
  return null;
}

/**
 * Discover package names belonging to a monorepo workspace.
 *
 * @param {string} workspaceRoot
 * @returns {Promise<Set<string>>}
 */
async function getWorkspacePackageNames(workspaceRoot) {
  const pkgNames = new Set();
  const rootPkgPath = path.join(workspaceRoot, 'package.json');
  let pkg;
  try {
    const raw = await fsp.readFile(rootPkgPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch {
    return pkgNames;
  }

  const rawWorkspaces = pkg && pkg.workspaces;
  let workspacePatterns = [];
  if (Array.isArray(rawWorkspaces)) {
    workspacePatterns = rawWorkspaces.filter(p => typeof p === 'string');
  } else if (rawWorkspaces && typeof rawWorkspaces === 'object' && Array.isArray(rawWorkspaces.packages)) {
    workspacePatterns = rawWorkspaces.packages.filter(p => typeof p === 'string');
  }

  for (const pattern of workspacePatterns) {
    const cleanPattern = pattern.replace(/\/\*+$/, '');
    const baseDir = path.join(workspaceRoot, cleanPattern);
    try {
      const entries = await fsp.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const subPkgJson = path.join(baseDir, entry.name, 'package.json');
          try {
            const rawSub = await fsp.readFile(subPkgJson, 'utf8');
            const parsedSub = JSON.parse(rawSub);
            if (parsedSub && typeof parsedSub.name === 'string') {
              pkgNames.add(parsedSub.name);
            }
          } catch {
            // Ignore unparseable or missing sub-package package.json
          }
        }
      }
    } catch {
      // Pattern directory does not exist or cannot be read
    }
  }

  return pkgNames;
}

/**
 * Check if a package is used by scripts declared in package.json.
 *
 * @param {Object} scripts
 * @param {string} pkgName
 * @returns {boolean}
 */
function isPackageReferencedInScripts(scripts, pkgName) {
  if (!scripts || typeof scripts !== 'object' || !pkgName) {
    return false;
  }
  const escaped = pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(?:^|[^a-zA-Z0-9_@/-])' + escaped + '(?:$|[^a-zA-Z0-9_@/-])');
  for (const scriptContent of Object.values(scripts)) {
    if (typeof scriptContent === 'string' && regex.test(scriptContent)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  DEFAULT_IGNORE_DIRS,
  JS_EXTENSIONS,
  exists,
  toPosixPath,
  readJsonFile,
  readTextFile,
  isNodeBuiltin,
  stripComments,
  walkFiles,
  getGitTrackedFiles,
  parseEnvKeys,
  extractEnvReferences,
  extractImportSpecifiers,
  analyzeDynamicImports,
  isPackageReferencedDynamically,
  getPackageNameFromSpecifier,
  findWorkspaceRoot,
  getWorkspacePackageNames,
  isPackageReferencedInScripts
};
