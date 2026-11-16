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
  const { project, summary, findings, duration } = inspectionResult;

  const lines = [];

  // Header
  lines.push('');
  lines.push(`${c.bold(c.cyan('RANGER'))} ${c.dim(`v${version}`)} ${c.dim('—')} ${c.bold('Project Health Inspector')}`);
  lines.push(c.dim('────────────────────────────────────────────────────────────'));
  lines.push(`${c.dim('Project:')}   ${c.bold(project.name)}`);
  lines.push(`${c.dim('Target:')}    ${project.path}`);
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

  const summaryLine = `${c.bold('Summary:')}  ${parts.join(c.dim('  •  '))} ${c.dim(`(scanned in ${duration}ms)`)}`;
  lines.push(summaryLine);

  if (summary.errors > 0) {
    lines.push(`${c.bold('Status:')}   ${c.red(c.bold('Failed'))} ${c.dim('— critical issues require attention')}`);
  } else if (summary.warnings > 0) {
    lines.push(`${c.bold('Status:')}   ${c.yellow(c.bold('Passed with warnings'))} ${c.dim('— consider addressing suggested improvements')}`);
  } else {
    lines.push(`${c.bold('Status:')}   ${c.green(c.bold('Passed'))} ${c.dim('— all health checks satisfied')}`);
  }

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
  formatTerminal
};
