'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pkg = require('../package.json');
const ranger = require('../src/index');
const dependenciesRule = require('../src/rules/dependencies');
const environmentRule = require('../src/rules/environment');
const securityRule = require('../src/rules/security');
const configurationRule = require('../src/rules/configuration');

test('Package Configuration', async (t) => {
  await t.test('has correct package metadata', () => {
    assert.equal(pkg.name, 'ranger');
    assert.equal(pkg.version, '0.1.0');
    assert.equal(pkg.description, 'A lightweight health inspector for JavaScript projects');
    assert.equal(pkg.license, 'MIT');
    assert.equal(pkg.type, 'commonjs');
  });

  await t.test('has valid entry points and bin mappings', () => {
    assert.equal(pkg.main, 'src/index.js');
    assert.ok(pkg.bin, 'bin field must exist');
    assert.equal(pkg.bin.ranger, 'src/cli.js');

    const mainPath = path.resolve(__dirname, '..', pkg.main);
    const binPath = path.resolve(__dirname, '..', pkg.bin.ranger);

    assert.ok(fs.existsSync(mainPath), `Main file does not exist: ${mainPath}`);
    assert.ok(fs.existsSync(binPath), `Bin file does not exist: ${binPath}`);
  });

  await t.test('specifies supported Node.js engines and test script', () => {
    assert.ok(pkg.engines && pkg.engines.node, 'engines.node must be specified');
    assert.equal(pkg.engines.node, '>=18');
    assert.equal(pkg.scripts.test, 'node --test');
  });
});

test('Public API (src/index.js)', async (t) => {
  await t.test('exports run function and rules registry', () => {
    assert.equal(typeof ranger.run, 'function');
    assert.equal(typeof ranger.rules, 'object');
    assert.notEqual(ranger.rules, null);
  });

  await t.test('run() returns initial execution result', async () => {
    const result = await ranger.run();
    assert.equal(result.status, 'ready');
    assert.equal(result.version, '0.1.0');
    assert.equal(typeof result.projectRoot, 'string');
    assert.deepEqual(result.rules, ['dependencies', 'environment', 'security', 'configuration']);
  });

  await t.test('run() enforces parameter type boundaries', async () => {
    await assert.rejects(
      async () => {
        await ranger.run({ cwd: '' });
      },
      {
        name: 'TypeError',
        message: 'Option "cwd" must be a non-empty string path.'
      }
    );
  });
});

test('Diagnostic Rules Interface', async (t) => {
  const expectedRules = [
    { module: dependenciesRule, name: 'dependencies' },
    { module: environmentRule, name: 'environment' },
    { module: securityRule, name: 'security' },
    { module: configurationRule, name: 'configuration' }
  ];

  for (const { module: rule, name } of expectedRules) {
    await t.test(`rule "${name}" conforms to diagnostic rule interface`, async () => {
      assert.equal(rule.name, name);
      assert.equal(typeof rule.description, 'string');
      assert.ok(rule.description.length > 0);
      assert.equal(typeof rule.run, 'function');

      await assert.rejects(
        async () => {
          await rule.run({});
        },
        {
          name: 'Error',
          message: /Not implemented/
        }
      );
    });
  }
});

test('CLI Executable (src/cli.js)', async (t) => {
  const cliPath = path.resolve(__dirname, '../src/cli.js');

  await t.test('contains node shebang at line 1', () => {
    const content = fs.readFileSync(cliPath, 'utf8');
    const firstLine = content.split('\n')[0].trim();
    assert.equal(firstLine, '#!/usr/bin/env node');
  });

  await t.test('runs successfully via node execution with default directory', () => {
    const result = spawnSync(process.execPath, [cliPath], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `Process failed with stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('Ranger v0.1.0'), 'CLI should output version info');
    assert.ok(result.stdout.includes('foundation initialized'), 'CLI should output status message');
  });

  await t.test('runs successfully with custom project directory argument (.)', () => {
    const result = spawnSync(process.execPath, [cliPath, '.'], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `Process failed with stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('Ranger v0.1.0'), 'CLI should output version info');
    assert.ok(result.stdout.includes('foundation initialized'), 'CLI should output status message');
  });
});
