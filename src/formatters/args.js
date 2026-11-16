'use strict';

const path = require('node:path');

const VALID_FAIL_ON_SEVERITIES = new Set(['error', 'warning', 'info']);

/**
 * Parse command-line arguments for the Devora CLI.
 *
 * @param {string[]} argv - Array of command-line argument strings.
 * @returns {{
 *   projectPath: string,
 *   json: boolean,
 *   noColor: boolean,
 *   help: boolean,
 *   version: boolean,
 *   listRules: boolean,
 *   scoreOnly: boolean,
 *   configPath: string|null,
 *   failOn: 'error'|'warning'|'info'|null,
 *   unknown: string[],
 *   error: string|null
 * }}
 */
function parseArgs(argv = []) {
  const result = {
    projectPath: process.cwd(),
    json: false,
    noColor: false,
    help: false,
    version: false,
    listRules: false,
    scoreOnly: false,
    configPath: null,
    failOn: null,
    unknown: [],
    error: null
  };

  let pathSet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--version' || arg === '-v') {
      result.version = true;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--no-color') {
      result.noColor = true;
    } else if (arg === '--list-rules') {
      result.listRules = true;
    } else if (arg === '--score') {
      result.scoreOnly = true;
    } else if (arg === '--fail-on') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        const val = argv[i + 1].toLowerCase();
        if (VALID_FAIL_ON_SEVERITIES.has(val)) {
          result.failOn = val;
          i++;
        } else {
          result.error = `Invalid severity value "${argv[i + 1]}" for --fail-on. Allowed values: error, warning, info.`;
          return result;
        }
      } else {
        result.error = 'Missing severity value for --fail-on. Allowed values: error, warning, info.';
        return result;
      }
    } else if (arg.startsWith('--fail-on=')) {
      const val = arg.slice('--fail-on='.length).toLowerCase();
      if (VALID_FAIL_ON_SEVERITIES.has(val)) {
        result.failOn = val;
      } else {
        result.error = `Invalid severity value "${val}" for --fail-on. Allowed values: error, warning, info.`;
        return result;
      }
    } else if (arg === '--config') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result.configPath = argv[i + 1];
        i++;
      } else {
        result.error = 'Missing file path for --config option.';
        return result;
      }
    } else if (arg.startsWith('--config=')) {
      const val = arg.slice('--config='.length);
      if (val.trim() === '') {
        result.error = 'Missing file path for --config option.';
        return result;
      }
      result.configPath = val;
    } else if (arg.startsWith('-')) {
      result.unknown.push(arg);
    } else {
      if (!pathSet) {
        result.projectPath = path.resolve(process.cwd(), arg);
        pathSet = true;
      } else {
        result.unknown.push(arg);
      }
    }
  }

  return result;
}

/**
 * Returns formatted CLI help text.
 *
 * @param {string} version - Current package version.
 * @returns {string}
 */
function getHelpText(version) {
  return `Devora v${version}
A lightweight health inspector for JavaScript and Node.js projects.

USAGE:
  devora [path] [options]
  npx devora [path] [options]

ARGUMENTS:
  [path]                 Target project directory (defaults to current directory)

OPTIONS:
  --config <path>        Explicit path to devora.config.json
  --fail-on <severity>   Set failure threshold for CI exit code: error, warning, info
  --json                 Output findings and score as machine-readable JSON
  --score                Display health score and summary in a concise format
  --list-rules           List all available diagnostic rules and default severities
  --no-color             Disable terminal colors (also respects NO_COLOR env)
  -h, --help             Display this help message
  -v, --version          Display the installed version

EXIT CODES:
  0   Inspection completed successfully; no configured failure threshold reached
  1   Findings reached the configured failure threshold (default: errors > 0)
  2   Invalid arguments, configuration errors, or execution failures

EXAMPLES:
  devora
  devora .
  devora /path/to/project
  devora --fail-on warning
  devora --fail-on error --json
  devora --score
  devora --list-rules
  devora --config devora.config.json
  devora --json
  devora --no-color
`;
}

module.exports = {
  VALID_FAIL_ON_SEVERITIES,
  parseArgs,
  getHelpText
};
