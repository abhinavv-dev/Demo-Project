'use strict';

/**
 * Format inspection result as valid, machine-readable JSON.
 *
 * @param {Object} inspectionResult - Result from inspectProject().
 * @returns {string} JSON string representation.
 */
function formatJson(inspectionResult) {
  return JSON.stringify(inspectionResult, null, 2) + '\n';
}

module.exports = {
  formatJson
};
