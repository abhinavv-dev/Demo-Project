'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const { isKnownRule } = require('./registry');

const ALLOWED_SEVERITIES = new Set(['error', 'warning', 'info']);
const ALLOWED_GRADES = ['A', 'B', 'C', 'D'];

/**
 * Convert a glob pattern into a RegExp.
 * Supports * and **.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegExp(glob) {
  const normalized = glob.replace(/\\/g, '/').replace(/^\.\//, '');
  let reStr = '^';
  let i = 0;
  while (i < normalized.length) {
    const c = normalized[i];
    if (c === '*' && normalized[i + 1] === '*') {
      if (normalized[i + 2] === '/') {
        reStr += '(?:.+/)?';
        i += 3;
      } else {
        reStr += '.*';
        i += 2;
      }
    } else if (c === '*') {
      reStr += '[^/]*';
      i++;
    } else if (c === '?') {
      reStr += '[^/]';
      i++;
    } else if (['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'].includes(c)) {
      reStr += '\\' + c;
      i++;
    } else {
      reStr += c;
      i++;
    }
  }
  reStr += '$';
  return new RegExp(reStr);
}

/**
 * Validate configuration structure and types.
 * Throws detailed Error on invalid configuration.
 *
 * @param {any} config
 * @returns {Object} Normalized validated configuration.
 */
function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('Configuration must be a JSON object.');
  }

  const allowedTopKeys = new Set(['rules', 'exclude', 'scoring']);
  for (const key of Object.keys(config)) {
    if (!allowedTopKeys.has(key)) {
      throw new Error(`Unexpected configuration property: "${key}". Allowed properties: "rules", "exclude", "scoring".`);
    }
  }

  const normalized = {
    rules: {
      disabled: [],
      severity: {}
    },
    exclude: [],
    scoring: {
      weights: {
        error: 20,
        warning: 7,
        info: 0
      },
      grades: {
        A: 90,
        B: 80,
        C: 70,
        D: 60
      }
    }
  };

  // Validate rules section
  if (config.rules !== undefined) {
    if (!config.rules || typeof config.rules !== 'object' || Array.isArray(config.rules)) {
      throw new Error('Configuration field "rules" must be an object.');
    }

    const allowedRulesKeys = new Set(['disabled', 'severity']);
    for (const key of Object.keys(config.rules)) {
      if (!allowedRulesKeys.has(key)) {
        throw new Error(`Unexpected property in "rules": "${key}". Allowed: "disabled", "severity".`);
      }
    }

    if (config.rules.disabled !== undefined) {
      if (!Array.isArray(config.rules.disabled)) {
        throw new Error('Configuration field "rules.disabled" must be an array of rule ID strings.');
      }
      for (const ruleId of config.rules.disabled) {
        if (typeof ruleId !== 'string' || ruleId.trim() === '') {
          throw new Error('Each item in "rules.disabled" must be a non-empty string rule ID.');
        }
        if (!isKnownRule(ruleId)) {
          throw new Error(`Unknown rule ID in "rules.disabled": "${ruleId}". Run "devora --list-rules" to see available rules.`);
        }
      }
      normalized.rules.disabled = [...config.rules.disabled];
    }

    if (config.rules.severity !== undefined) {
      if (!config.rules.severity || typeof config.rules.severity !== 'object' || Array.isArray(config.rules.severity)) {
        throw new Error('Configuration field "rules.severity" must be an object mapping rule IDs to severity values.');
      }
      for (const [ruleId, sev] of Object.entries(config.rules.severity)) {
        if (!isKnownRule(ruleId)) {
          throw new Error(`Unknown rule ID in "rules.severity": "${ruleId}". Run "devora --list-rules" to see available rules.`);
        }
        if (!ALLOWED_SEVERITIES.has(sev)) {
          throw new Error(`Invalid severity value "${sev}" for rule "${ruleId}". Allowed severities: "error", "warning", "info".`);
        }
      }
      normalized.rules.severity = { ...config.rules.severity };
    }
  }

  // Validate exclude section
  if (config.exclude !== undefined) {
    if (!Array.isArray(config.exclude)) {
      throw new Error('Configuration field "exclude" must be an array of glob pattern strings.');
    }
    for (const pattern of config.exclude) {
      if (typeof pattern !== 'string' || pattern.trim() === '') {
        throw new Error('Each pattern in "exclude" must be a non-empty string glob.');
      }
    }
    normalized.exclude = [...config.exclude];
  }

  // Validate scoring section
  if (config.scoring !== undefined) {
    if (!config.scoring || typeof config.scoring !== 'object' || Array.isArray(config.scoring)) {
      throw new Error('Configuration field "scoring" must be an object.');
    }

    const allowedScoringKeys = new Set(['weights', 'grades']);
    for (const key of Object.keys(config.scoring)) {
      if (!allowedScoringKeys.has(key)) {
        throw new Error(`Unexpected property in "scoring": "${key}". Allowed: "weights", "grades".`);
      }
    }

    if (config.scoring.weights !== undefined) {
      if (!config.scoring.weights || typeof config.scoring.weights !== 'object' || Array.isArray(config.scoring.weights)) {
        throw new Error('Configuration field "scoring.weights" must be an object.');
      }
      for (const [sev, weight] of Object.entries(config.scoring.weights)) {
        if (!ALLOWED_SEVERITIES.has(sev)) {
          throw new Error(`Invalid severity key in "scoring.weights": "${sev}". Allowed: "error", "warning", "info".`);
        }
        if (typeof weight !== 'number' || Number.isNaN(weight) || weight < 0) {
          throw new Error(`Scoring weight for "${sev}" must be a non-negative number. Received: ${weight}`);
        }
      }
      normalized.scoring.weights = {
        ...normalized.scoring.weights,
        ...config.scoring.weights
      };
    }

    if (config.scoring.grades !== undefined) {
      if (!config.scoring.grades || typeof config.scoring.grades !== 'object' || Array.isArray(config.scoring.grades)) {
        throw new Error('Configuration field "scoring.grades" must be an object.');
      }
      for (const [grade, threshold] of Object.entries(config.scoring.grades)) {
        if (!ALLOWED_GRADES.includes(grade)) {
          throw new Error(`Invalid grade in "scoring.grades": "${grade}". Allowed: "A", "B", "C", "D".`);
        }
        if (typeof threshold !== 'number' || Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
          throw new Error(`Grade threshold for "${grade}" must be a number between 0 and 100. Received: ${threshold}`);
        }
      }

      const mergedGrades = {
        ...normalized.scoring.grades,
        ...config.scoring.grades
      };

      // Check strictly descending order: A > B > C > D
      if (!(mergedGrades.A > mergedGrades.B && mergedGrades.B > mergedGrades.C && mergedGrades.C > mergedGrades.D)) {
        throw new Error(`Grade thresholds must strictly decrease in order (A > B > C > D). Got: A=${mergedGrades.A}, B=${mergedGrades.B}, C=${mergedGrades.C}, D=${mergedGrades.D}`);
      }

      normalized.scoring.grades = mergedGrades;
    }
  }

  return normalized;
}

/**
 * Load and validate project configuration.
 *
 * @param {string} projectRoot - Absolute project root path.
 * @param {string} [explicitConfigPath] - Optional user-specified path to config file.
 * @returns {Promise<{ config: Object, configPath: string|null }>}
 */
async function loadConfig(projectRoot, explicitConfigPath = null) {
  let targetPath = null;

  if (explicitConfigPath) {
    targetPath = path.resolve(process.cwd(), explicitConfigPath);
    let stat;
    try {
      stat = await fsp.stat(targetPath);
    } catch {
      throw new Error(`Specified configuration file does not exist: "${targetPath}"`);
    }
    if (!stat.isFile()) {
      throw new Error(`Specified configuration path is not a file: "${targetPath}"`);
    }
  } else {
    // Check devora.config.json first, then fall back to ranger.config.json for backwards compatibility
    const primaryPath = path.join(projectRoot, 'devora.config.json');
    const legacyPath = path.join(projectRoot, 'ranger.config.json');

    try {
      const stat = await fsp.stat(primaryPath);
      if (stat.isFile()) {
        targetPath = primaryPath;
      }
    } catch {
      targetPath = null;
    }

    if (!targetPath) {
      try {
        const stat = await fsp.stat(legacyPath);
        if (stat.isFile()) {
          targetPath = legacyPath;
        }
      } catch {
        targetPath = null;
      }
    }
  }

  if (!targetPath) {
    return {
      config: validateConfig({}),
      configPath: null
    };
  }

  let raw;
  try {
    raw = await fsp.readFile(targetPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read configuration file "${targetPath}": ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON syntax in configuration file "${targetPath}": ${err.message}`);
  }

  const validated = validateConfig(parsed);

  return {
    config: validated,
    configPath: targetPath
  };
}

/**
 * Check if a file relative path matches any exclusion pattern.
 *
 * @param {string|null} relFilePath - Relative file path or null.
 * @param {string[]} excludePatterns - List of glob patterns.
 * @returns {boolean}
 */
function isFileExcluded(relFilePath, excludePatterns = []) {
  if (!relFilePath || !excludePatterns || excludePatterns.length === 0) {
    return false;
  }

  const normalizedPath = relFilePath.replace(/\\/g, '/').replace(/^\.\//, '');

  for (const pattern of excludePatterns) {
    const rx = globToRegExp(pattern);
    if (rx.test(normalizedPath)) {
      return true;
    }
    // Also match if pattern is a directory and file is inside it (e.g. "coverage/**" or "coverage")
    const cleanPattern = pattern.replace(/\\/g, '/').replace(/\/\*\*?$/, '').replace(/\/$/, '');
    if (normalizedPath === cleanPattern || normalizedPath.startsWith(cleanPattern + '/')) {
      return true;
    }
  }

  return false;
}

module.exports = {
  globToRegExp,
  validateConfig,
  loadConfig,
  isFileExcluded
};
