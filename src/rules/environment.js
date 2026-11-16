'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const {
  exists,
  toPosixPath,
  walkFiles,
  getGitTrackedFiles,
  parseEnvKeys,
  extractEnvReferences
} = require('../utils/fs');

const ENV_EXAMPLE_FILENAMES = [
  '.env.example',
  '.env.sample',
  '.env.template',
  'env.example',
  '.env.dist'
];

const environmentRule = {
  name: 'environment',
  category: 'environment',
  description: 'Inspects runtime environment configurations, template completeness, and tracked env files',

  /**
   * Run the environment diagnostic check.
   *
   * @param {Object} context
   * @param {string} context.projectRoot
   * @param {Map<string, string[]>} [context.fileCache]
   * @returns {Promise<Array<Object>>}
   */
  async run(context = {}) {
    const { projectRoot, fileCache } = context;
    const findings = [];

    // 1. Locate source files and extract process.env references
    const sourceFiles = await walkFiles(projectRoot, {
      extensions: new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx']),
      fileCache
    });

    const envRefsMap = await extractEnvReferences(sourceFiles, projectRoot);
    const referencedVarNames = new Set(envRefsMap.keys());

    // 2. Check for .env.example or template file
    let exampleFileName = null;
    let exampleContent = null;
    for (const name of ENV_EXAMPLE_FILENAMES) {
      const fullPath = path.join(projectRoot, name);
      if (await exists(fullPath)) {
        exampleFileName = name;
        try {
          exampleContent = await fsp.readFile(fullPath, 'utf8');
        } catch {
          exampleContent = '';
        }
        break;
      }
    }

    // A. Missing environment template:
    // If environment variables are referenced in source code but no template file exists
    if (referencedVarNames.size > 0 && !exampleFileName) {
      findings.push({
        id: 'ENV001',
        category: 'environment',
        severity: 'warning',
        title: 'Missing environment template file',
        message: 'Environment variables are referenced in project source code, but no .env.example or template file exists.',
        file: null,
        recommendation: 'Create a .env.example file documenting all required environment variables with placeholder values.',
        fixable: false
      });
    }

    // B. Environment variable documentation:
    // Compare variables in source code with template file
    if (exampleFileName && exampleContent !== null) {
      const documentedKeys = parseEnvKeys(exampleContent);

      // Identify undocumented variables (present in code, absent from template)
      for (const varName of referencedVarNames) {
        // Exclude standard Node.js / system variables like NODE_ENV
        if (varName === 'NODE_ENV') {
          continue;
        }

        if (!documentedKeys.has(varName)) {
          findings.push({
            id: 'ENV002',
            category: 'environment',
            severity: 'warning',
            title: 'Undocumented environment variable',
            message: `Environment variable "${varName}" is referenced in source code but not documented in ${exampleFileName}.`,
            file: exampleFileName,
            recommendation: `Add "${varName}=" with a description or placeholder to ${exampleFileName}.`,
            fixable: false
          });
        }
      }

      // Identify stale documented variables (present in template, but never referenced)
      // Only flag if at least one file was scanned and references exist
      for (const docKey of documentedKeys) {
        if (!referencedVarNames.has(docKey) && referencedVarNames.size > 0) {
          findings.push({
            id: 'ENV003',
            category: 'environment',
            severity: 'info',
            title: 'Unreferenced environment variable',
            message: `Variable "${docKey}" is documented in ${exampleFileName} but does not appear to be referenced in project source files.`,
            file: exampleFileName,
            recommendation: `Verify if "${docKey}" is still required by the project or if it can be removed.`,
            fixable: false
          });
        }
      }
    }

    // C. Sensitive environment files tracked in Git
    // Safe handling: Never read or expose environment variable values.
    const trackedFiles = getGitTrackedFiles(projectRoot);
    if (trackedFiles) {
      for (const relFile of trackedFiles) {
        const baseName = path.basename(relFile).toLowerCase();

        // Check if file is a sensitive .env file (not an example/template)
        const isEnvFile = baseName === '.env' || baseName.startsWith('.env.');
        const isTemplate = baseName.includes('example') ||
                           baseName.includes('sample') ||
                           baseName.includes('template') ||
                           baseName.includes('dist');

        if (isEnvFile && !isTemplate) {
          findings.push({
            id: 'ENV004',
            category: 'environment',
            severity: 'error',
            title: 'Tracked environment file in Git',
            message: `Environment configuration file "${relFile}" is tracked by Git. This risks exposing sensitive local settings.`,
            file: toPosixPath(relFile),
            recommendation: `Remove "${relFile}" from Git tracking using "git rm --cached ${relFile}" and add it to .gitignore.`,
            fixable: false
          });
        }
      }
    }

    return findings;
  }
};

module.exports = environmentRule;
