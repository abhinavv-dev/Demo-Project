'use strict';

const { createColors } = require('./colors');

/**
 * Format inspection results into a polished, professional terminal presentation.
 *
 * @param {Object} inspectionResult - Result from inspectProject().
 * @param {string} version - Current package version.
 * @param {boolean} [enableColor=true] - Whether terminal styling is enabled.
 * @returns {string} Formatted terminal output string.
 */
function formatTerminal(inspectionResult, version, enableColor = true) {
  const c = createColors(enableColor);
  const { project, summary, score, findings, duration } = inspectionResult;

  const lines = [];

  // Header
  lines.push('');
  lines.push(`${c.bold(c.cyan('RADAR'))} ${c.dim(`v${version}`)} ${c.dim('—')} ${c.bold('Project Health Inspector')}`);
  lines.push(c.dim('────────────────────────────────────────────────────────────'));
  lines.push(`${c.dim('Project:')}      ${c.bold(project.name)}`);
  lines.push(`${c.dim('Target:')}       ${project.path}`);

  // Health Score Display
  if (score) {
    let gradeColor;
    if (score.grade === 'A') {
      gradeColor = c.green;
    } else if (score.grade === 'B') {
      gradeColor = c.cyan;
    } else if (score.grade === 'C') {
      gradeColor = c.yellow;
    } else {
      gradeColor = c.red;
    }

    const scoreTag = gradeColor(c.bold(`${score.value}/100`));
    const gradeTag = gradeColor(c.bold(`Grade ${score.grade}`));
    lines.push(`${c.dim('Health Score:')} ${scoreTag} ${c.dim('—')} ${gradeTag}`);
  }

  lines.push('');

  // Findings Grouped by Severity
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const info = findings.filter(f => f.severity === 'info');

  if (findings.length === 0) {
    lines.push(`  ${c.green('✔')} ${c.green(c.bold('No issues detected.'))} Project is in good health.`);
    lines.push('');
  } else {
    // Render Errors
    if (errors.length > 0) {
      lines.push(`${c.bold(c.red('ERRORS'))} ${c.dim(`(${errors.length})`)}`);
      for (const f of errors) {
        renderFinding(lines, f, c);
      }
    }

    // Render Warnings
    if (warnings.length > 0) {
      lines.push(`${c.bold(c.yellow('WARNINGS'))} ${c.dim(`(${warnings.length})`)}`);
      for (const f of warnings) {
        renderFinding(lines, f, c);
      }
    }

    // Render Info
    if (info.length > 0) {
      lines.push(`${c.bold(c.blue('INFO'))} ${c.dim(`(${info.length})`)}`);
      for (const f of info) {
        renderFinding(lines, f, c);
      }
    }
  }

  // Summary & Footer
  lines.push(c.dim('────────────────────────────────────────────────────────────'));

  const parts = [];
  if (summary.errors > 0) {
    parts.push(c.red(c.bold(`${summary.errors} ${summary.errors === 1 ? 'error' : 'errors'}`)));
  } else {
    parts.push(c.green('0 errors'));
  }

  if (summary.warnings > 0) {
    parts.push(c.yellow(c.bold(`${summary.warnings} ${summary.warnings === 1 ? 'warning' : 'warnings'}`)));
  } else {
    parts.push(c.dim('0 warnings'));
  }

  if (summary.info > 0) {
    parts.push(c.blue(`${summary.info} ${summary.info === 1 ? 'notice' : 'notices'}`));
  } else {
    parts.push(c.dim('0 notices'));
  }

  const summaryLine = `${c.bold('Summary:')}     ${parts.join(c.dim('  •  '))} ${c.dim(`(scanned in ${duration}ms)`)}`;
  lines.push(summaryLine);

  if (summary.errors > 0) {
    lines.push(`${c.bold('Status:')}      ${c.red(c.bold('Failed'))} ${c.dim('— critical issues require attention')}`);
  } else if (summary.warnings > 0) {
    lines.push(`${c.bold('Status:')}      ${c.yellow(c.bold('Passed with warnings'))} ${c.dim('— consider addressing suggested improvements')}`);
  } else {
    lines.push(`${c.bold('Status:')}      ${c.green(c.bold('Passed'))} ${c.dim('— all health checks satisfied')}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Format concise score-only output.
 *
 * @param {Object} inspectionResult
 * @param {string} version
 * @param {boolean} [enableColor=true]
 * @returns {string}
 */
function formatScoreOnly(inspectionResult, version, enableColor = true) {
  const c = createColors(enableColor);
  const { project, summary, score, duration } = inspectionResult;

  let gradeColor;
  if (score.grade === 'A') {
    gradeColor = c.green;
  } else if (score.grade === 'B') {
    gradeColor = c.cyan;
  } else if (score.grade === 'C') {
    gradeColor = c.yellow;
  } else {
    gradeColor = c.red;
  }

  const lines = [
    '',
    `${c.bold(c.cyan('RADAR'))} ${c.dim(`v${version}`)} ${c.dim('—')} ${c.bold(project.name)}`,
    `${c.dim('Health Score:')} ${gradeColor(c.bold(`${score.value}/100`))} ${c.dim('(')}${gradeColor(c.bold(`Grade ${score.grade}`))}${c.dim(')')}`,
    `${c.dim('Breakdown:')}    ${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} notices ${c.dim(`(${duration}ms)`)}`,
    ''
  ];

  return lines.join('\n');
}

/**
 * Format the list of available diagnostic rules into a clean terminal table.
 *
 * @param {Array<Object>} rules
 * @param {boolean} [enableColor=true]
 * @returns {string}
 */
function formatRulesList(rules, enableColor = true) {
  const c = createColors(enableColor);
  const lines = [
    '',
    `${c.bold(c.cyan('RADAR'))} ${c.dim('— Available Diagnostic Rules')}`,
    c.dim('──────────────────────────────────────────────────────────────────────────'),
    `${c.bold('ID'.padEnd(10))} ${c.bold('CATEGORY'.padEnd(16))} ${c.bold('DEFAULT'.padEnd(10))} ${c.bold('TITLE')}`,
    c.dim('──────────────────────────────────────────────────────────────────────────')
  ];

  for (const r of rules) {
    let sevColor = c.dim;
    if (r.defaultSeverity === 'error') {
      sevColor = c.red;
    } else if (r.defaultSeverity === 'warning') {
      sevColor = c.yellow;
    } else if (r.defaultSeverity === 'info') {
      sevColor = c.blue;
    }

    const idStr = c.bold(r.id.padEnd(10));
    const catStr = c.dim(r.category.padEnd(16));
    const sevStr = sevColor(r.defaultSeverity.padEnd(10));
    const titleStr = r.title;

    lines.push(`${idStr} ${catStr} ${sevStr} ${titleStr}`);
  }

  lines.push(c.dim('──────────────────────────────────────────────────────────────────────────'));
  lines.push(`${c.dim(`Total rules:`)} ${rules.length}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a single finding into lines array.
 *
 * @param {string[]} lines
 * @param {Object} finding
 * @param {Object} c - Color helpers
 */
function renderFinding(lines, finding, c) {
  const badge = `[${finding.id}]`;
  const fileStr = finding.file ? ` ${c.dim(`(${finding.file})`)}` : '';

  let bullet;
  if (finding.severity === 'error') {
    bullet = c.red('✖');
  } else if (finding.severity === 'warning') {
    bullet = c.yellow('▲');
  } else {
    bullet = c.blue('ℹ');
  }

  lines.push(`  ${bullet} ${c.bold(badge)} ${finding.title}${fileStr}`);
  lines.push(`    ${c.dim('Message:')}        ${finding.message}`);
  lines.push(`    ${c.dim('Recommendation:')} ${c.cyan(finding.recommendation)}`);
  lines.push('');
}

module.exports = {
  formatTerminal,
  formatScoreOnly,
  formatRulesList
};
