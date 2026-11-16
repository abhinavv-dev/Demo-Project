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
  --json             Output findings as machine-readable JSON
  --no-color         Disable terminal colors
  -h, --help         Display this help message
  -v, --version      Display the installed version

EXAMPLES:
  ranger
  ranger .
  ranger /path/to/project
  ranger --json
  ranger /path/to/project --json
  ranger --no-color
`;
}

module.exports = {
  parseArgs,
  getHelpText
};
