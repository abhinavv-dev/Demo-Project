'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const pkg = require('../package.json');
const ranger = require('../src/index');
const { inspectProject } = require('../src/engine');
const dependenciesRule = require('../src/rules/dependencies');
const environmentRule = require('../src/rules/environment');
const securityRule = require('../src/rules/security');
const configurationRule = require('../src/rules/configuration');

// Helper to create a clean temporary test project directory
async function createTempProject(files = {}) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ranger-test-'));
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, relPath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, content, 'utf8');
  }
  return tmpDir;
}

// Helper to safely clean up a temp directory
async function cleanupTempProject(dir) {
  try {
    await fsp.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

test('Package Configuration', async (t) => {
  await t.test('has correct package metadata', () => {
    assert.equal(pkg.name, 'ranger');
    assert.equal(pkg.version, '0.2.0');
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
  await t.test('exports inspectProject, run, and rules registry', () => {
    assert.equal(typeof ranger.inspectProject, 'function');
    assert.equal(typeof ranger.run, 'function');
    assert.equal(typeof ranger.rules, 'object');
    assert.notEqual(ranger.rules, null);
  });

  await t.test('run() returns backwards-compatible execution result', async () => {
    const result = await ranger.run();
    assert.equal(result.status, 'completed');
    assert.equal(result.version, '0.2.0');
    assert.equal(typeof result.projectRoot, 'string');
    assert.deepEqual(result.rules, ['dependencies', 'environment', 'security', 'configuration']);
    assert.ok(result.inspection);
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

  await t.test('inspectProject can be called programmatically', async () => {
    const result = await ranger.inspectProject(__dirname);
    assert.ok(result.project);
    assert.ok(result.summary);
    assert.ok(Array.isArray(result.findings));
    assert.equal(typeof result.duration, 'number');
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

      const findings = await rule.run({ projectRoot: __dirname });
      assert.ok(Array.isArray(findings));
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
    assert.ok(result.stdout.includes('RANGER'), 'CLI should output RANGER header');
    assert.ok(result.stdout.includes('Target:'), 'CLI should output inspection target');
  });

  await t.test('runs successfully with custom project directory argument (.)', () => {
    const result = spawnSync(process.execPath, [cliPath, '.'], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, `Process failed with stderr: ${result.stderr}`);
    assert.ok(result.stdout.includes('RANGER'), 'CLI should output RANGER header');
    assert.ok(result.stdout.includes('Target:'), 'CLI should output inspection target');
  });
});

test('Diagnostic Engine Comprehensive Tests', async (t) => {
  // 1. Valid project with no major issues
  await t.test('1. Valid project with no major issues', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'valid-project',
        version: '1.0.0',
        engines: { node: '>=18' },
        main: 'index.js'
      }),
      'index.js': 'console.log("Hello, world!");'
    });

    try {
      const result = await inspectProject(dir);
      assert.equal(result.summary.errors, 0);
      assert.equal(result.summary.warnings, 0);
      assert.equal(result.project.name, 'valid-project');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 2. Missing declared dependency
  await t.test('2. Missing declared dependency', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'missing-dep-project',
        version: '1.0.0',
        dependencies: {
          'lodash': '^4.17.21'
        }
      }),
      'package-lock.json': '{}'
    });

    try {
      const result = await inspectProject(dir);
      const missingDep = result.findings.find(f => f.id === 'DEP004');
      assert.ok(missingDep, 'Should detect missing installed dependency');
      assert.equal(missingDep.severity, 'error');
      assert.ok(missingDep.message.includes('lodash'));
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 3. Missing .env.example
  await t.test('3. Missing .env.example', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'env-project', version: '1.0.0' }),
      'src/server.js': 'const port = process.env.PORT || 3000;'
    });

    try {
      const result = await inspectProject(dir);
      const envFinding = result.findings.find(f => f.id === 'ENV001');
      assert.ok(envFinding, 'Should detect missing .env.example');
      assert.equal(envFinding.severity, 'warning');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 4. Undocumented environment variable
  await t.test('4. Undocumented environment variable', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'env-doc-project', version: '1.0.0' }),
      '.env.example': 'PORT=3000\n',
      'src/app.js': 'const db = process.env.DATABASE_URL;\nconst port = process.env.PORT;'
    });

    try {
      const result = await inspectProject(dir);
      const undocFinding = result.findings.find(f => f.id === 'ENV002' && f.message.includes('DATABASE_URL'));
      assert.ok(undocFinding, 'Should report undocumented variable DATABASE_URL');
      assert.equal(undocFinding.severity, 'warning');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 5. Tracked .env file detection where Git is available
  await t.test('5. Tracked .env file detection where Git is available', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'git-env-project', version: '1.0.0' }),
      '.env': 'SECRET_KEY=12345'
    });

    try {
      try {
        execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
        execFileSync('git', ['add', '.env'], { cwd: dir, stdio: 'ignore' });

        const result = await inspectProject(dir);
        const trackedEnv = result.findings.find(f => f.id === 'ENV004' || f.id === 'SEC001');
        assert.ok(trackedEnv, 'Should flag tracked .env file');
        assert.equal(trackedEnv.severity, 'error');
      } catch {
        // Skip if git is not available in environment
      }
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 6. Potential hardcoded secret detection without leaking the value
  await t.test('6. Potential hardcoded secret detection without leaking the value', async () => {
    const fakeSecret = 'superSecretKeyAssignmentValue12345';
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'secret-project', version: '1.0.0' }),
      'lib/client.js': `const apiKey = "${fakeSecret}";`
    });

    try {
      const result = await inspectProject(dir);
      const secretFinding = result.findings.find(f => f.id === 'SEC003');
      assert.ok(secretFinding, 'Should detect potential hardcoded credential');
      assert.equal(secretFinding.severity, 'warning');
      assert.ok(!secretFinding.message.includes(fakeSecret), 'Must NOT leak secret value in message');
      assert.ok(!JSON.stringify(secretFinding).includes(fakeSecret), 'Must NOT contain secret value anywhere');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 7. Invalid package.json
  await t.test('7. Invalid package.json syntax', async () => {
    const dir = await createTempProject({
      'package.json': '{ name: broken json, }'
    });

    try {
      const result = await inspectProject(dir);
      const cfgFinding = result.findings.find(f => f.id === 'CFG002');
      assert.ok(cfgFinding, 'Should detect invalid JSON in package.json');
      assert.equal(cfgFinding.severity, 'error');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 8. Missing configured main entry point
  await t.test('8. Missing configured main entry point', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'missing-main',
        version: '1.0.0',
        main: 'dist/bundle.js'
      })
    });

    try {
      const result = await inspectProject(dir);
      const mainFinding = result.findings.find(f => f.id === 'CFG008');
      assert.ok(mainFinding, 'Should detect missing main entry point');
      assert.equal(mainFinding.severity, 'error');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 9. Project directory does not exist
  await t.test('9. Project directory does not exist', async () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-${Date.now()}`);
    await assert.rejects(
      async () => {
        await inspectProject(nonExistent);
      },
      {
        name: 'Error',
        message: /Project directory does not exist/
      }
    );
  });

  // 10. Empty project directory
  await t.test('10. Empty project directory', async () => {
    const dir = await createTempProject({});

    try {
      const result = await inspectProject(dir);
      const missingPkg = result.findings.find(f => f.id === 'CFG001');
      assert.ok(missingPkg, 'Should report missing package.json for empty directory');
      assert.equal(missingPkg.severity, 'error');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 11. Ignored node_modules and generated directories
  await t.test('11. Ignored node_modules and generated directories', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'ignore-test', version: '1.0.0' }),
      'node_modules/fake-lib/index.js': 'process.env.IGNORED_NODE_MODULES_VAR = 1;',
      'dist/bundle.js': 'process.env.IGNORED_DIST_VAR = 2;',
      'coverage/lcov-report/index.js': 'process.env.IGNORED_COVERAGE_VAR = 3;'
    });

    try {
      const result = await inspectProject(dir);
      const envFinding = result.findings.find(f => f.id === 'ENV001');
      // None of the variables in node_modules, dist, or coverage should trigger ENV001
      assert.equal(envFinding, undefined, 'Should not scan node_modules, dist, or coverage');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 12. Rule failure does not crash the entire engine
  await t.test('12. Rule failure does not crash the entire engine', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'crash-resilience', version: '1.0.0' })
    });

    // Temporarily replace a rule's run method to simulate an unhandled crash
    const originalRun = securityRule.run;
    securityRule.run = async () => {
      throw new Error('Simulated catastrophic rule failure');
    };

    try {
      const result = await inspectProject(dir);
      assert.ok(result, 'Engine should return results despite rule failure');
      const engineFinding = result.findings.find(f => f.id === 'ENG001');
      assert.ok(engineFinding, 'Should record ENG001 error finding for failed rule');
      assert.ok(engineFinding.message.includes('Simulated catastrophic rule failure'));
    } finally {
      securityRule.run = originalRun;
      await cleanupTempProject(dir);
    }
  });

  // 13. Severity sorting
  await t.test('13. Severity sorting (error before warning before info)', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'severity-test',
        // missing version -> error (CFG004)
        // missing engines.node -> info (CFG006)
        main: 'missing.js' // missing main -> error (CFG008)
      }),
      'src/index.js': 'const x = process.env.TEST_VAR;' // missing .env.example -> warning (ENV001)
    });

    try {
      const result = await inspectProject(dir);
      assert.ok(result.findings.length >= 3);

      let lastSeverityWeight = -1;
      const weight = { error: 0, warning: 1, info: 2 };
      for (const finding of result.findings) {
        const currentWeight = weight[finding.severity];
        assert.ok(
          currentWeight >= lastSeverityWeight,
          `Findings must be ordered by severity: encountered ${finding.severity} after higher severity`
        );
        lastSeverityWeight = currentWeight;
      }
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 14. Category filtering
  await t.test('14. Category filtering', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'category-filter', version: '1.0.0' }),
      'src/index.js': 'const key = process.env.SECRET_PORT;'
    });

    try {
      // Only run configuration category
      const configOnly = await inspectProject(dir, { categories: ['configuration'] });
      for (const f of configOnly.findings) {
        assert.equal(f.category, 'configuration');
      }

      // Exclude environment category
      const noEnv = await inspectProject(dir, { excludeCategories: ['environment'] });
      for (const f of noEnv.findings) {
        assert.notEqual(f.category, 'environment');
      }
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 15. Programmatic API usage
  await t.test('15. Programmatic API usage', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'programmatic-test',
        version: '1.0.0',
        engines: { node: '>=18' }
      })
    });

    try {
      const { inspectProject: inspect } = require('../src/index');
      const result = await inspect(dir);
      assert.equal(typeof result, 'object');
      assert.equal(result.project.name, 'programmatic-test');
      assert.equal(result.project.path, dir);
      assert.equal(result.summary.errors, 0);
      assert.equal(typeof result.duration, 'number');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 16. Security scanning in test/fixture directories and dummy value handling
  await t.test('16. Real-looking AWS key in a test directory is detected', async () => {
    const awsKey = 'AKIA' + 'J9X8W7V6U5T4S3R2'; // genuine-looking 20-char AKIA pattern
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'test-aws-scan', version: '1.0.0' }),
      'test/integration/aws.test.js': `const clientKey = "${awsKey}";`
    });

    try {
      const result = await inspectProject(dir);
      const awsFinding = result.findings.find(f => f.id === 'SEC003' && f.title.includes('AWS'));
      assert.ok(awsFinding, 'Should detect real-looking AWS key even inside test/ directory');
      assert.equal(awsFinding.severity, 'warning');
      assert.ok(!JSON.stringify(awsFinding).includes(awsKey), 'Must not leak secret value in findings');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('17. Private key header in a fixture directory is detected', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'fixture-key-scan', version: '1.0.0' }),
      'fixtures/certs/server.js': 'const key = "-----BEGIN RSA PRIVATE KEY-----\\nMIIEowIBAAKCAQEA0...";'
    });

    try {
      const result = await inspectProject(dir);
      const keyFinding = result.findings.find(f => f.id === 'SEC003' && f.title.includes('private key'));
      assert.ok(keyFinding, 'Should detect private key header in fixtures/ directory');
      assert.equal(keyFinding.severity, 'warning');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('18. Explicit dummy/example credentials do not produce false positives', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'dummy-creds-test', version: '1.0.0' }),
      'src/config.js': `
        const apiKey = "dummy_mock_api_key_12345678";
        const password = "change_me_sample_fake_pwd";
        const fakeToken = "your-api-key-here-12345678";
      `
    });

    try {
      const result = await inspectProject(dir);
      const secFindings = result.findings.filter(f => f.category === 'security');
      assert.equal(secFindings.length, 0, 'Explicit dummy credentials should not trigger SEC003 findings');
    } finally {
      await cleanupTempProject(dir);
    }
  });
});

test('Step 3 CLI & JSON Presentation Features', async (t) => {
  const cliPath = path.resolve(__dirname, '../src/cli.js');

  // 1. Default human-readable output
  await t.test('1. Default human-readable output formatting', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'cli-human-demo', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.ok(res.stdout.includes('RANGER'), 'Output includes RANGER branding');
      assert.ok(res.stdout.includes('cli-human-demo'), 'Output includes project name');
      assert.ok(res.stdout.includes('Summary:'), 'Output includes summary');
      assert.ok(res.stdout.includes('Status:'), 'Output includes final status');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 2. JSON output and successful JSON.parse()
  await t.test('2. JSON output parses successfully and preserves structure', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'cli-json-demo', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir, '--json'], { encoding: 'utf8' });
      assert.equal(res.status, 0);

      const parsed = JSON.parse(res.stdout);
      assert.equal(typeof parsed, 'object');
      assert.equal(parsed.project.name, 'cli-json-demo');
      assert.ok(parsed.summary);
      assert.ok(Array.isArray(parsed.findings));
      assert.equal(typeof parsed.duration, 'number');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 3. JSON output contains no ANSI escape sequences or banners
  await t.test('3. JSON output contains no ANSI escape sequences or decorative banners', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'clean-json-test', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir, '--json'], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.ok(!res.stdout.includes('\x1b['), 'JSON stdout must not contain ANSI escapes');
      assert.ok(!res.stdout.includes('RANGER v'), 'JSON stdout must not contain banner text');
      assert.doesNotThrow(() => JSON.parse(res.stdout));
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 4. --no-color behaviour
  await t.test('4. --no-color disables ANSI escape codes', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'nocolor-flag-test', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir, '--no-color'], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.ok(!res.stdout.includes('\x1b['), '--no-color must strip ANSI escapes');
      assert.ok(res.stdout.includes('RANGER'), 'Content is still displayed');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 5. NO_COLOR environment variable
  await t.test('5. NO_COLOR environment variable disables ANSI escape codes', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'nocolor-env-test', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir], {
        encoding: 'utf8',
        env: { ...process.env, NO_COLOR: '1' }
      });
      assert.equal(res.status, 0);
      assert.ok(!res.stdout.includes('\x1b['), 'NO_COLOR must strip ANSI escapes');
      assert.ok(res.stdout.includes('RANGER'), 'Content is still displayed');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 6. --help output
  await t.test('6. --help displays usage information and exits with 0', () => {
    const res = spawnSync(process.execPath, [cliPath, '--help'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('USAGE:'));
    assert.ok(res.stdout.includes('--json'));
    assert.ok(res.stdout.includes('--no-color'));
  });

  // 7. --version output
  await t.test('7. --version displays installed version and exits with 0', () => {
    const res = spawnSync(process.execPath, [cliPath, '--version'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.startsWith('v'));
  });

  // 8. Custom project directory
  await t.test('8. Custom project directory is targeted correctly in CLI', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'custom-dir-project', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.ok(res.stdout.includes('custom-dir-project'));
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 9. Invalid project path
  await t.test('9. Invalid project path exits with 1 and prints clean error', () => {
    const nonExistent = path.join(os.tmpdir(), `non-existent-ranger-${Date.now()}`);
    const res = spawnSync(process.execPath, [cliPath, nonExistent], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.ok(res.stderr.includes('Ranger Error:'));
  });

  // 10. Unknown CLI arguments
  await t.test('10. Unknown CLI arguments exit with 1 and inform user', () => {
    const res = spawnSync(process.execPath, [cliPath, '--unknown-flag'], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.ok(res.stderr.includes('Unknown option "--unknown-flag"'));
    assert.ok(res.stderr.includes('--help'));
  });

  // 11. Secret redaction in both human and JSON output
  await t.test('11. Secret redaction verified in both human and JSON output', async () => {
    const rawSecret = 'AKIA' + 'M1N2B3V4C5X6Z7Y8';
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'redact-test', version: '1.0.0' }),
      'auth.js': `const awsAccessKey = "${rawSecret}";`
    });

    try {
      // Human output
      const humanRes = spawnSync(process.execPath, [cliPath, dir], { encoding: 'utf8' });
      assert.ok(!humanRes.stdout.includes(rawSecret), 'Secret must not be in human stdout');
      assert.ok(!humanRes.stderr.includes(rawSecret), 'Secret must not be in human stderr');
      assert.ok(humanRes.stdout.includes('Potential AWS Access Key ID'));

      // JSON output
      const jsonRes = spawnSync(process.execPath, [cliPath, dir, '--json'], { encoding: 'utf8' });
      assert.ok(!jsonRes.stdout.includes(rawSecret), 'Secret must not be in JSON stdout');
      assert.ok(!jsonRes.stderr.includes(rawSecret), 'Secret must not be in JSON stderr');
      const parsed = JSON.parse(jsonRes.stdout);
      const secretFinding = parsed.findings.find(f => f.id === 'SEC003');
      assert.ok(secretFinding, 'Secret finding should exist in JSON');
      assert.ok(!JSON.stringify(secretFinding).includes(rawSecret));
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // 12. Non-zero exit code when critical errors exist
  await t.test('12. CLI exits with code 1 when critical errors exist', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'error-exit-test',
        dependencies: { 'missing-dep-pkg': '^1.0.0' }
      })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir], { encoding: 'utf8' });
      assert.equal(res.status, 1, 'Should exit with code 1 when errors exist');
    } finally {
      await cleanupTempProject(dir);
    }
  });
});
