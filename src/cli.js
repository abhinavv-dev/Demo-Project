#!/usr/bin/env node

'use strict';

const path = require('node:path');
const { run } = require('./index');

/**
 * CLI execution entry point for Ranger.
 *
 * @param {string[]} [argv=process.argv.slice(2)] - Command line arguments.
 * @returns {Promise<void>}
 */
async function main(argv = process.argv.slice(2)) {
  try {
    const targetDir = argv[0] ? path.resolve(process.cwd(), argv[0]) : process.cwd();
    const result = await run({ cwd: targetDir });
    process.stdout.write(`Ranger v${result.version}\n${result.message}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`Ranger Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
