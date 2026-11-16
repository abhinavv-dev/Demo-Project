'use strict';

const pkg = require('../package.json');
const { inspectProject, rules } = require('./engine');
const { calculateHealthScore } = require('./scoring');
const { validateConfig, loadConfig } = require('./config');
const { listRules, getRule, isKnownRule } = require('./registry');

/**
 * Backward-compatible run helper.
 *
 * @param {Object} [options={}]
 * @param {string} [options.cwd=process.cwd()]
 * @param {string[]} [options.rules]
 * @param {string} [options.configPath]
 * @returns {Promise<Object>}
 */
async function run(options = {}) {
  const projectRoot = options.cwd !== undefined ? options.cwd : process.cwd();

  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('Option "cwd" must be a non-empty string path.');
  }

  const inspection = await inspectProject(projectRoot, {
    categories: options.rules,
    configPath: options.configPath
  });

  return {
    status: 'completed',
    version: pkg.version,
    projectRoot: inspection.project.path,
    rules: Object.keys(rules),
    message: `Inspection completed with ${inspection.summary.errors} errors, ${inspection.summary.warnings} warnings, and ${inspection.summary.info} notices.`,
    inspection
  };
}

module.exports = {
  inspectProject,
  run,
  rules,
  calculateHealthScore,
  validateConfig,
  loadConfig,
  listRules,
  getRule,
  isKnownRule
};
