'use strict';

const { inspectProject, rules } = require('./engine');

/**
 * Backward-compatible run helper.
 *
 * @param {Object} [options={}]
 * @param {string} [options.cwd=process.cwd()]
 * @param {string[]} [options.rules]
 * @returns {Promise<Object>}
 */
async function run(options = {}) {
  const projectRoot = options.cwd !== undefined ? options.cwd : process.cwd();

  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('Option "cwd" must be a non-empty string path.');
  }

  const inspection = await inspectProject(projectRoot, {
    categories: options.rules
  });

  return {
    status: 'completed',
    version: '0.1.0',
    projectRoot: inspection.project.path,
    rules: Object.keys(rules),
    message: `Inspection completed with ${inspection.summary.errors} errors, ${inspection.summary.warnings} warnings, and ${inspection.summary.info} notices.`,
    inspection
  };
}

module.exports = {
  inspectProject,
  run,
  rules
};
