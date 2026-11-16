'use strict';

const path = require('node:path');

/**
 * Parse command-line arguments for the Ranger CLI.
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
 *   unknown: string[]
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
    unknown: []
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
    } else if (arg === '--config') {
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        result.configPath = argv[i + 1];
        i++;
      } else {
        result.unknown.push(arg);
      }
    } else if (arg.startsWith('--config=')) {
      result.configPath = arg.slice('--config='.length);
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
  return `Ranger v${version}
A lightweight health inspector for JavaScript and Node.js projects.

USAGE:
  ranger [path] [options]
  npx ranger [path] [options]

ARGUMENTS:
  [path]             Target project directory (defaults to current directory)

OPTIONS:
  --config <path>    Explicit path to ranger.config.json
  --json             Output findings and score as machine-readable JSON
  --score            Display health score and summary in a concise format
  --list-rules       List all available diagnostic rules and default severities
  --no-color         Disable terminal colors
  -h, --help         Display this help message
  -v, --version      Display the installed version

EXAMPLES:
  ranger
  ranger .
  ranger /path/to/project
  ranger --score
  ranger --list-rules
  ranger --config ranger.config.json
  ranger --json
  ranger --no-color
`;
}

module.exports = {
  parseArgs,
  getHelpText
};
