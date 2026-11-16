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

  // Handle unknown options gracefully
  if (options.unknown.length > 0) {
    process.stderr.write(`Ranger Error: Unknown option "${options.unknown[0]}"\nRun "ranger --help" for available options.\n`);
    process.exitCode = 1;
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

    if (result.summary.errors > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    if (options.json) {
      process.stderr.write(JSON.stringify({
        error: error.message
      }, null, 2) + '\n');
    } else {
      process.stderr.write(`Ranger Error: ${error.message}\n`);
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
