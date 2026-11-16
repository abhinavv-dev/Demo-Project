#!/usr/bin/env node

'use strict';

const path = require('node:path');
const pkg = require('../package.json');
const { inspectProject } = require('./engine');

/**
 * CLI execution entry point.
 *
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
async function main(argv = process.argv.slice(2)) {
  try {
    const targetDir = argv[0] ? path.resolve(process.cwd(), argv[0]) : process.cwd();

    process.stdout.write(`Ranger v${pkg.version}\n`);

    const result = await inspectProject(targetDir);
    const { project, summary, findings } = result;

    process.stdout.write(`\nInspection Target: ${project.name} (${project.path})\n`);
    process.stdout.write(`Summary: ${summary.total} findings (${summary.errors} errors, ${summary.warnings} warnings, ${summary.info} notices) in ${result.duration}ms\n\n`);

    if (findings.length > 0) {
      for (const finding of findings) {
        const tag = `[${finding.severity.toUpperCase()}] [${finding.category}] ${finding.id}:`;
        const loc = finding.file ? ` (${finding.file})` : '';
        process.stdout.write(`${tag} ${finding.title}${loc}\n`);
        process.stdout.write(`  Message: ${finding.message}\n`);
        process.stdout.write(`  Recommendation: ${finding.recommendation}\n\n`);
      }
    } else {
      process.stdout.write('✓ No issues detected. Project is in good health!\n\n');
    }

    if (summary.errors > 0) {
      process.exitCode = 1;
    } else {
      process.exitCode = 0;
    }
  } catch (error) {
    process.stderr.write(`Ranger Error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
