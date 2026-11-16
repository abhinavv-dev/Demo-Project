'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const { readJsonFile } = require('./utils/fs');
const { loadConfig, isFileExcluded } = require('./config');
const { calculateHealthScore } = require('./scoring');

const dependenciesRule = require('./rules/dependencies');
const environmentRule = require('./rules/environment');
const securityRule = require('./rules/security');
const configurationRule = require('./rules/configuration');

const ALL_RULES = {
  dependencies: dependenciesRule,
  environment: environmentRule,
  security: securityRule,
  configuration: configurationRule
};

const SEVERITY_ORDER = {
  error: 0,
  warning: 1,
  info: 2
};

/**
 * Inspect a Node.js project for configuration, dependency, environment, and security health.
 *
 * @param {string} projectPath - Path to the target project directory.
 * @param {Object} [options={}] - Inspection configuration options.
 * @param {string} [options.configPath] - Explicit path to radar.config.json or ranger.config.json.
 * @param {Object} [options.config] - Pre-loaded or inline configuration object.
 * @param {string[]} [options.categories] - Array of categories to run (default: all).
 * @param {string[]} [options.excludeCategories] - Array of categories to skip.
 * @param {Object} [options.ruleOptions] - Custom configuration per rule.
 * @returns {Promise<Object>} Inspection results including summary, score, findings, and duration.
 */
async function inspectProject(projectPath, options = {}) {
  const startTime = Date.now();

  if (typeof projectPath !== 'string' || projectPath.trim() === '') {
    throw new TypeError('Target project path must be a non-empty string.');
  }

  const resolvedPath = path.resolve(projectPath);

  // Validate that the target directory exists and is a directory
  let stat;
  try {
    stat = await fsp.stat(resolvedPath);
  } catch (err) {
    throw new Error(`Project directory does not exist: "${resolvedPath}"`);
  }

  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: "${resolvedPath}"`);
  }

  // Load project configuration (explicit path, auto-discovered radar.config.json / ranger.config.json, or default)
  let config;
  let loadedConfigPath = null;
  if (options.config) {
    const { validateConfig } = require('./config');
    config = validateConfig(options.config);
  } else {
    const configResult = await loadConfig(resolvedPath, options.configPath);
    config = configResult.config;
    loadedConfigPath = configResult.configPath;
  }

  // Derive project name from package.json if available, or directory name
  let projectName = path.basename(resolvedPath);
  try {
    const pkgResult = await readJsonFile(path.join(resolvedPath, 'package.json'));
    if (pkgResult.content && typeof pkgResult.content.name === 'string') {
      projectName = pkgResult.content.name;
    }
  } catch {
    // Keep directory basename
  }

  // Determine active rule categories
  const categoriesFilter = options.categories ? new Set(options.categories) : null;
  const excludeFilter = options.excludeCategories ? new Set(options.excludeCategories) : null;

  // Single-run memoization cache for walkFiles (strictly per inspection, no cross-inspection leakage)
  const fileCache = new Map();

  const context = {
    projectRoot: resolvedPath,
    options: options.ruleOptions || {},
    config,
    fileCache
  };

  const rawFindings = [];

  for (const [categoryName, ruleModule] of Object.entries(ALL_RULES)) {
    if (categoriesFilter && !categoriesFilter.has(categoryName)) {
      continue;
    }
    if (excludeFilter && excludeFilter.has(categoryName)) {
      continue;
    }

    try {
      const ruleFindings = await ruleModule.run(context);
      if (Array.isArray(ruleFindings)) {
        rawFindings.push(...ruleFindings);
      }
    } catch (ruleError) {
      // Individual rule failure must not crash the entire engine
      rawFindings.push({
        id: 'ENG001',
        category: categoryName,
        severity: 'error',
        title: `Diagnostic rule failure in ${categoryName}`,
        message: `An unexpected error occurred while executing the "${categoryName}" rule: ${ruleError.message}`,
        file: null,
        recommendation: 'Check project permissions or report this issue if it persists.',
        fixable: false
      });
    }
  }

  // Filter and transform findings using project configuration
  const disabledRuleIds = new Set(config.rules.disabled || []);
  const severityOverrides = config.rules.severity || {};
  const excludePatterns = config.exclude || [];

  const processedFindings = [];

  for (const finding of rawFindings) {
    // 1. Check if rule is disabled
    if (disabledRuleIds.has(finding.id)) {
      continue;
    }

    // 2. Check if file is excluded by glob pattern
    if (finding.file && isFileExcluded(finding.file, excludePatterns)) {
      continue;
    }

    // 3. Apply severity overrides if configured
    let effectiveSeverity = finding.severity;
    if (severityOverrides[finding.id]) {
      effectiveSeverity = severityOverrides[finding.id];
    }

    processedFindings.push({
      ...finding,
      severity: effectiveSeverity
    });
  }

  // Sort findings by severity: error -> warning -> info, then by category and id
  processedFindings.sort((a, b) => {
    const orderA = SEVERITY_ORDER[a.severity] ?? 99;
    const orderB = SEVERITY_ORDER[b.severity] ?? 99;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.id.localeCompare(b.id);
  });

  // Calculate summary counts
  const summary = {
    total: processedFindings.length,
    errors: processedFindings.filter(f => f.severity === 'error').length,
    warnings: processedFindings.filter(f => f.severity === 'warning').length,
    info: processedFindings.filter(f => f.severity === 'info').length
  };

  // Calculate health score using scoring configuration
  const score = calculateHealthScore(processedFindings, config.scoring);

  const duration = Date.now() - startTime;

  return {
    project: {
      name: projectName,
      path: resolvedPath
    },
    configPath: loadedConfigPath,
    summary,
    score,
    findings: processedFindings,
    duration
  };
}

module.exports = {
  inspectProject,
  rules: ALL_RULES
};
