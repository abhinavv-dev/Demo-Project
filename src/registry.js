'use strict';

/**
 * Standard registry of diagnostic rules supported by Radar.
 */
const KNOWN_RULES = [
  // Configuration
  {
    id: 'CFG001',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Missing package.json'
  },
  {
    id: 'CFG002',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Invalid package.json structure or syntax'
  },
  {
    id: 'CFG003',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Missing or empty package name'
  },
  {
    id: 'CFG004',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Missing or empty package version'
  },
  {
    id: 'CFG005',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Invalid scripts definition'
  },
  {
    id: 'CFG006',
    category: 'configuration',
    defaultSeverity: 'info',
    title: 'Missing Node.js engine compatibility requirement'
  },
  {
    id: 'CFG007',
    category: 'configuration',
    defaultSeverity: 'warning',
    title: 'Outdated Node.js engine requirement'
  },
  {
    id: 'CFG008',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Missing main entry point file'
  },
  {
    id: 'CFG009',
    category: 'configuration',
    defaultSeverity: 'error',
    title: 'Missing executable bin file'
  },
  // Dependencies
  {
    id: 'DEP001',
    category: 'dependencies',
    defaultSeverity: 'error',
    title: 'Invalid dependencies definition'
  },
  {
    id: 'DEP002',
    category: 'dependencies',
    defaultSeverity: 'error',
    title: 'Invalid dependency version'
  },
  {
    id: 'DEP003',
    category: 'dependencies',
    defaultSeverity: 'warning',
    title: 'Missing dependency lockfile'
  },
  {
    id: 'DEP004',
    category: 'dependencies',
    defaultSeverity: 'error',
    title: 'Missing installed dependency'
  },
  {
    id: 'DEP005',
    category: 'dependencies',
    defaultSeverity: 'info',
    title: 'Unused dependency candidate'
  },
  // Environment
  {
    id: 'ENV001',
    category: 'environment',
    defaultSeverity: 'warning',
    title: 'Missing environment template file'
  },
  {
    id: 'ENV002',
    category: 'environment',
    defaultSeverity: 'warning',
    title: 'Undocumented environment variable'
  },
  {
    id: 'ENV003',
    category: 'environment',
    defaultSeverity: 'info',
    title: 'Unused template environment variable'
  },
  {
    id: 'ENV004',
    category: 'environment',
    defaultSeverity: 'error',
    title: 'Tracked environment file in Git'
  },
  // Security
  {
    id: 'SEC001',
    category: 'security',
    defaultSeverity: 'error',
    title: 'Sensitive environment file tracked in Git'
  },
  {
    id: 'SEC002',
    category: 'security',
    defaultSeverity: 'error',
    title: 'Sensitive credential or key file tracked in Git'
  },
  {
    id: 'SEC003',
    category: 'security',
    defaultSeverity: 'warning',
    title: 'Potential hardcoded credential or secret'
  }
];

const RULES_BY_ID = new Map(KNOWN_RULES.map(r => [r.id, r]));

/**
 * List all available diagnostic rules.
 *
 * @returns {Array<{ id: string, category: string, defaultSeverity: string, title: string }>}
 */
function listRules() {
  return KNOWN_RULES.map(r => ({ ...r }));
}

/**
 * Get rule metadata by ID.
 *
 * @param {string} id
 * @returns {Object|null}
 */
function getRule(id) {
  const rule = RULES_BY_ID.get(id);
  return rule ? { ...rule } : null;
}

/**
 * Check if a rule ID is recognized by Radar.
 *
 * @param {string} id
 * @returns {boolean}
 */
function isKnownRule(id) {
  return RULES_BY_ID.has(id);
}

module.exports = {
  KNOWN_RULES,
  listRules,
  getRule,
  isKnownRule
};
