'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const {
  exists,
  readJsonFile
} = require('../utils/fs');

const configurationRule = {
  name: 'configuration',
  category: 'configuration',
  description: 'Inspects package.json validity, Node.js engine compatibility, and project structure',

  /**
   * Run the configuration diagnostic check.
   *
   * @param {Object} context
   * @param {string} context.projectRoot
   * @returns {Promise<Array<Object>>}
   */
  async run(context = {}) {
    const { projectRoot } = context;
    const findings = [];
    const pkgPath = path.join(projectRoot, 'package.json');

    // A. package.json validation
    const pkgExists = await exists(pkgPath);
    if (!pkgExists) {
      findings.push({
        id: 'CFG001',
        category: 'configuration',
        severity: 'error',
        title: 'Missing package.json',
        message: 'No package.json file was found in the project root directory.',
        file: 'package.json',
        recommendation: 'Initialize a package.json file using "npm init" to define the project.',
        fixable: false
      });
      return findings;
    }

    let pkg;
    try {
      const parsed = await readJsonFile(pkgPath);
      pkg = parsed.content;
    } catch (err) {
      findings.push({
        id: 'CFG002',
        category: 'configuration',
        severity: 'error',
        title: 'Invalid package.json JSON syntax',
        message: `package.json contains invalid JSON syntax: ${err.message}`,
        file: 'package.json',
        recommendation: 'Fix the syntax error in package.json so it can be parsed as valid JSON.',
        fixable: false
      });
      return findings;
    }

    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
      findings.push({
        id: 'CFG002',
        category: 'configuration',
        severity: 'error',
        title: 'Invalid package.json structure',
        message: 'package.json must contain a top-level JSON object.',
        file: 'package.json',
        recommendation: 'Ensure package.json root is an object ({ ... }).',
        fixable: false
      });
      return findings;
    }

    // Check name
    if (!pkg.name || typeof pkg.name !== 'string' || pkg.name.trim() === '') {
      findings.push({
        id: 'CFG003',
        category: 'configuration',
        severity: 'error',
        title: 'Missing or empty package name',
        message: 'package.json does not specify a valid "name" field.',
        file: 'package.json',
        recommendation: 'Add a valid package "name" to package.json.',
        fixable: false
      });
    }

    // Check version
    if (!pkg.version || typeof pkg.version !== 'string' || pkg.version.trim() === '') {
      findings.push({
        id: 'CFG004',
        category: 'configuration',
        severity: 'error',
        title: 'Missing or empty package version',
        message: 'package.json does not specify a valid "version" field.',
        file: 'package.json',
        recommendation: 'Add a valid "version" field (e.g. "0.1.0" or "1.0.0") following semantic versioning.',
        fixable: false
      });
    }

    // Check scripts structure
    if (pkg.scripts !== undefined) {
      if (typeof pkg.scripts !== 'object' || pkg.scripts === null || Array.isArray(pkg.scripts)) {
        findings.push({
          id: 'CFG005',
          category: 'configuration',
          severity: 'error',
          title: 'Invalid scripts definition',
          message: 'The "scripts" field in package.json is not a valid object.',
          file: 'package.json',
          recommendation: 'Ensure "scripts" is an object mapping script names to command strings.',
          fixable: false
        });
      }
    }

    // B. Node.js compatibility (engines.node)
    if (!pkg.engines || !pkg.engines.node) {
      findings.push({
        id: 'CFG006',
        category: 'configuration',
        severity: 'info',
        title: 'Missing Node.js engine compatibility requirement',
        message: 'package.json does not declare an "engines.node" field specifying supported runtime versions.',
        file: 'package.json',
        recommendation: 'Define the supported Node.js versions in package.json (e.g. "engines": { "node": ">=18" }).',
        fixable: false
      });
    } else if (typeof pkg.engines.node === 'string') {
      const nodeEngine = pkg.engines.node.trim();
      // Check if clearly specifying an outdated version like <16 or 12 or 14
      if (/^[<~^]?(?:1[0-5]|[0-9])(?:\.|$)/.test(nodeEngine)) {
        findings.push({
          id: 'CFG007',
          category: 'configuration',
          severity: 'warning',
          title: 'Outdated Node.js engine requirement',
          message: `package.json specifies Node.js engine "${nodeEngine}", which has reached End-of-Life (EOL).`,
          file: 'package.json',
          recommendation: 'Upgrade "engines.node" to a currently maintained LTS version (>=18 or >=20).',
          fixable: false
        });
      }
    }

    // C. Project structure: entry points and bin paths
    if (pkg.main && typeof pkg.main === 'string') {
      const mainPath = path.resolve(projectRoot, pkg.main);
      const mainExists = await exists(mainPath);
      if (!mainExists) {
        findings.push({
          id: 'CFG008',
          category: 'configuration',
          severity: 'error',
          title: 'Missing main entry point file',
          message: `The configured "main" entry point "${pkg.main}" does not exist on disk.`,
          file: 'package.json',
          recommendation: `Ensure the file "${pkg.main}" exists or update the "main" field in package.json.`,
          fixable: false
        });
      }
    }

    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        const binPath = path.resolve(projectRoot, pkg.bin);
        if (!(await exists(binPath))) {
          findings.push({
            id: 'CFG009',
            category: 'configuration',
            severity: 'error',
            title: 'Missing executable bin file',
            message: `The configured "bin" file "${pkg.bin}" does not exist on disk.`,
            file: 'package.json',
            recommendation: `Ensure "${pkg.bin}" exists and has executable permissions.`,
            fixable: false
          });
        }
      } else if (typeof pkg.bin === 'object' && !Array.isArray(pkg.bin)) {
        for (const [binName, binRelPath] of Object.entries(pkg.bin)) {
          if (typeof binRelPath === 'string') {
            const binPath = path.resolve(projectRoot, binRelPath);
            if (!(await exists(binPath))) {
              findings.push({
                id: 'CFG009',
                category: 'configuration',
                severity: 'error',
                title: 'Missing executable bin file',
                message: `The configured "bin" entry "${binName}" points to "${binRelPath}", which does not exist on disk.`,
                file: 'package.json',
                recommendation: `Ensure "${binRelPath}" exists and has executable permissions.`,
                fixable: false
              });
            }
          }
        }
      }
    }

    return findings;
  }
};

module.exports = configurationRule;
