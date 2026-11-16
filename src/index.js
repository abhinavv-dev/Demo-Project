'use strict';

const dependenciesRule = require('./rules/dependencies');
const environmentRule = require('./rules/environment');
const securityRule = require('./rules/security');
const configurationRule = require('./rules/configuration');

/**
 * Registry of available diagnostic rules.
 */
const rules = {
  dependencies: dependenciesRule,
  environment: environmentRule,
  security: securityRule,
  configuration: configurationRule
};

/**
 * Run ranger inspection on a target project directory.
 *
 * @param {Object} [options={}] - Configuration options for the inspection.
 * @param {string} [options.cwd=process.cwd()] - Target project directory path.
 * @param {string[]} [options.rules] - Optional list of specific rule names to execute.
 * @returns {Promise<{status: string, version: string, projectRoot: string, rules: string[], message: string}>}
 */
async function run(options = {}) {
  const projectRoot = options.cwd !== undefined ? options.cwd : process.cwd();

  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('Option "cwd" must be a non-empty string path.');
  }

  return {
    status: 'ready',
    version: '0.1.0',
    projectRoot,
    rules: Object.keys(rules),
    message: 'Ranger project foundation initialized.'
  };
}

module.exports = {
  run,
  rules
};
