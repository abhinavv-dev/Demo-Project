'use strict';

/**
 * Diagnostic Rule: Security
 *
 * Checks for known package vulnerabilities, committed secrets, sensitive files,
 * and unsafe scripting practices.
 *
 * @typedef {Object} RuleContext
 * @property {string} projectRoot - Absolute path to the project root directory.
 * @property {Record<string, unknown>} [options] - Rule execution options.
 *
 * @typedef {Object} DiagnosticIssue
 * @property {'error'|'warning'|'info'} severity - Severity level of the issue.
 * @property {string} message - Clear description of the detected issue.
 * @property {string} [remediation] - Recommended action to resolve the issue.
 *
 * @typedef {Object} RuleResult
 * @property {string} name - The rule name.
 * @property {boolean} passed - Whether the rule passed without critical errors.
 * @property {DiagnosticIssue[]} issues - List of issues identified by this rule.
 */

const securityRule = {
  name: 'security',
  description: 'Inspects project security posture, leaked secrets, and unsafe configurations',

  /**
   * Run the security diagnostic check.
   *
   * @param {RuleContext} _context - Execution context for the rule.
   * @returns {Promise<RuleResult>} Diagnostic result.
   */
  async run(_context = {}) {
    throw new Error('Not implemented: diagnostic logic will be implemented in Step 2.');
  }
};

module.exports = securityRule;
