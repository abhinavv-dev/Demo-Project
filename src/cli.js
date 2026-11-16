#!/usr/bin/env node

'use strict';

const pkg = require('../package.json');
const { inspectProject } = require('./engine');
const { listRules } = require('./registry');
const { parseArgs, getHelpText } = require('./formatters/args');
const { shouldEnableColor } = require('./formatters/colors');
const { formatTerminal, formatScoreOnly, formatRulesList } = require('./formatters/terminal');
const { formatJson } = require('./formatters/json');

/**
 * Determine exit code based on findings summary and fail-on severity threshold.
 *
 * @param {{ errors: number, warnings: number, info: number }} summary
 * @param {'error'|'warning'|'info'|null} failOn
 * @returns {number}
 */
function determineExitCode(summary, failOn) {
  if (failOn === 'info') {
    return (summary.errors > 0 || summary.warnings > 0 || summary.info > 0) ? 1 : 0;
  }
  if (failOn === 'warning') {
    return (summary.errors > 0 || summary.warnings > 0) ? 1 : 0;
  }
  // Default behavior or --fail-on error
  return summary.errors > 0 ? 1 : 0;
}

/**
 * CLI execution entry point.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  const enableColor = shouldEnableColor({
    noColorFlag: options.noColor,
    env: process.env,
    isTTY: process.stdout.isTTY
  });

  // Handle --help
  if (options.help) {
    process.stdout.write(getHelpText(pkg.version));
    process.exitCode = 0;
    return;
  }

  // Handle --version
  if (options.version) {
    process.stdout.write(`v${pkg.version}\n`);
    process.exitCode = 0;
    return;
  }

  // Handle --list-rules
  if (options.listRules) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ rules: listRules() }, null, 2) + '\n');
    } else {
      process.stdout.write(formatRulesList(listRules(), enableColor));
    }
    process.exitCode = 0;
    return;
  }

  // Handle argument parsing errors (e.g. invalid --fail-on value)
  if (options.error) {
    if (options.json) {
      process.stderr.write(JSON.stringify({ error: options.error }, null, 2) + '\n');
    } else {
      process.stderr.write(`Radar Error: ${options.error}\nRun "radar --help" for available options.\n`);
    }
    process.exitCode = 2;
    return;
  }

  // Handle unknown options gracefully
  if (options.unknown.length > 0) {
    const msg = `Unknown option "${options.unknown[0]}"`;
    if (options.json) {
      process.stderr.write(JSON.stringify({ error: msg }, null, 2) + '\n');
    } else {
      process.stderr.write(`Radar Error: ${msg}\nRun "radar --help" for available options.\n`);
    }
    process.exitCode = 2;
    return;
  }

  try {
    const result = await inspectProject(options.projectPath, {
      configPath: options.configPath
    });

    if (options.json) {
      process.stdout.write(formatJson(result));
    } else if (options.scoreOnly) {
      process.stdout.write(formatScoreOnly(result, pkg.version, enableColor));
    } else {
      process.stdout.write(formatTerminal(result, pkg.version, enableColor));
    }

    process.exitCode = determineExitCode(result.summary, options.failOn);
  } catch (error) {
    if (options.json) {
      process.stderr.write(JSON.stringify({
        error: error.message
      }, null, 2) + '\n');
    } else {
      process.stderr.write(`Radar Error: ${error.message}\n`);
    }
    // Execution / configuration / directory failures exit with code 2
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, determineExitCode };
