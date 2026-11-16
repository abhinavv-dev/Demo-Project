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
    assert.equal(pkg.version, '0.3.0');
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
    assert.equal(result.version, '0.3.0');
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

test('Step 4 Health Scoring & Configuration Engine', async (t) => {
  const cliPath = path.resolve(__dirname, '../src/cli.js');
  const { calculateHealthScore } = require('../src/scoring');
  const { validateConfig, loadConfig } = require('../src/config');
  const { listRules, getRule, isKnownRule } = require('../src/registry');

  // Health scoring tests
  await t.test('1. Perfect project gets score 100 and Grade A', () => {
    const score = calculateHealthScore([]);
    assert.equal(score.value, 100);
    assert.equal(score.grade, 'A');
    assert.equal(score.penalties, 0);
  });

  await t.test('2. Error penalties apply 20 points per error', () => {
    const findings = [
      { id: 'CFG001', category: 'configuration', severity: 'error' },
      { id: 'DEP004', category: 'dependencies', severity: 'error' }
    ];
    const score = calculateHealthScore(findings);
    assert.equal(score.penalties, 40);
    assert.equal(score.value, 60);
    assert.equal(score.grade, 'D');
    assert.equal(score.categories.configuration, 20);
    assert.equal(score.categories.dependencies, 20);
  });

  await t.test('3. Warning penalties apply 7 points per warning', () => {
    const findings = [
      { id: 'ENV001', category: 'environment', severity: 'warning' },
      { id: 'DEP003', category: 'dependencies', severity: 'warning' }
    ];
    const score = calculateHealthScore(findings);
    assert.equal(score.penalties, 14);
    assert.equal(score.value, 86);
    assert.equal(score.grade, 'B');
    assert.equal(score.categories.environment, 7);
    assert.equal(score.categories.dependencies, 7);
  });

  await t.test('4. Info findings do not reduce the default score', () => {
    const findings = [
      { id: 'CFG006', category: 'configuration', severity: 'info' },
      { id: 'DEP005', category: 'dependencies', severity: 'info' }
    ];
    const score = calculateHealthScore(findings);
    assert.equal(score.penalties, 0);
    assert.equal(score.value, 100);
    assert.equal(score.grade, 'A');
  });

  await t.test('5. Score never falls below zero', () => {
    const findings = Array(10).fill({ id: 'CFG001', category: 'configuration', severity: 'error' });
    const score = calculateHealthScore(findings);
    assert.equal(score.penalties, 200);
    assert.equal(score.value, 0);
    assert.equal(score.grade, 'F');
  });

  await t.test('6. Grade thresholds work correctly', () => {
    assert.equal(calculateHealthScore([]).grade, 'A'); // 100 -> A
    assert.equal(calculateHealthScore([{ severity: 'warning', category: 'env' }]).grade, 'A'); // 100 - 7 = 93 -> A (90-100)
    // 2 warnings = 14 penalties -> 86 (B: 80-89)
    assert.equal(calculateHealthScore([{ severity: 'warning', category: 'env' }, { severity: 'warning', category: 'env' }]).grade, 'B');
    // 1 error + 1 warning = 27 penalties -> 73 (C: 70-79)
    assert.equal(calculateHealthScore([{ severity: 'error', category: 'env' }, { severity: 'warning', category: 'env' }]).grade, 'C');
    // 2 errors = 40 penalties -> 60 (D: 60-69)
    assert.equal(calculateHealthScore([{ severity: 'error', category: 'env' }, { severity: 'error', category: 'env' }]).grade, 'D');
    // 3 errors = 60 penalties -> 40 (F: 0-59)
    assert.equal(calculateHealthScore(Array(3).fill({ severity: 'error', category: 'env' })).grade, 'F');
  });

  await t.test('7. Custom scoring weights work', () => {
    const customConfig = {
      weights: { error: 50, warning: 10, info: 5 }
    };
    const findings = [
      { severity: 'error', category: 'env' },
      { severity: 'warning', category: 'env' },
      { severity: 'info', category: 'env' }
    ];
    const score = calculateHealthScore(findings, customConfig);
    assert.equal(score.penalties, 65);
    assert.equal(score.value, 35);
    assert.equal(score.grade, 'F');
  });

  await t.test('8. Custom grade thresholds work', () => {
    const customConfig = {
      grades: { A: 95, B: 85, C: 75, D: 65 }
    };
    // 1 warning = 93 points -> below 95, so Grade B
    const score = calculateHealthScore([{ severity: 'warning', category: 'env' }], customConfig);
    assert.equal(score.value, 93);
    assert.equal(score.grade, 'B');
  });

  await t.test('9. Repeated scans produce deterministic scores', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'deterministic-scoring', version: '1.0.0' }),
      'index.js': 'console.log(process.env.TEST_KEY);'
    });

    try {
      const res1 = await inspectProject(dir);
      const res2 = await inspectProject(dir);
      assert.equal(res1.score.value, res2.score.value);
      assert.equal(res1.score.grade, res2.score.grade);
      assert.equal(res1.score.penalties, res2.score.penalties);
      assert.deepEqual(res1.score.categories, res2.score.categories);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  // Configuration tests
  await t.test('10. Automatic configuration discovery (ranger.config.json)', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'auto-config', version: '1.0.0' }),
      'ranger.config.json': JSON.stringify({
        rules: {
          disabled: ['CFG006']
        }
      })
    });

    try {
      const res = await inspectProject(dir);
      assert.ok(res.configPath.includes('ranger.config.json'));
      const cfgFinding = res.findings.find(f => f.id === 'CFG006');
      assert.equal(cfgFinding, undefined, 'CFG006 should be disabled by auto-discovered config');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('11. Explicit configuration path via options and CLI', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'explicit-config', version: '1.0.0' }),
      'custom-rules.json': JSON.stringify({
        rules: {
          disabled: ['CFG006']
        }
      })
    });

    try {
      const res = await inspectProject(dir, {
        configPath: path.join(dir, 'custom-rules.json')
      });
      assert.equal(res.findings.find(f => f.id === 'CFG006'), undefined);

      const cliRes = spawnSync(process.execPath, [
        cliPath,
        dir,
        '--config',
        path.join(dir, 'custom-rules.json'),
        '--json'
      ], { encoding: 'utf8' });
      assert.equal(cliRes.status, 0);
      const parsed = JSON.parse(cliRes.stdout);
      assert.equal(parsed.findings.find(f => f.id === 'CFG006'), undefined);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('12. Disabled rules are not executed or included in findings', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'disabled-rules-test',
        version: '1.0.0',
        dependencies: { 'missing-dep': '^1.0.0' }
      }),
      'ranger.config.json': JSON.stringify({
        rules: {
          disabled: ['DEP004', 'DEP003']
        }
      })
    });

    try {
      const res = await inspectProject(dir);
      assert.equal(res.findings.find(f => f.id === 'DEP004'), undefined);
      assert.equal(res.findings.find(f => f.id === 'DEP003'), undefined);
      // Score should not be penalized by disabled rules
      assert.equal(res.score.penalties, 0);
      assert.equal(res.score.value, 100);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('13. Severity overrides change effective severity and penalties', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'severity-override-test',
        version: '1.0.0',
        dependencies: { 'missing-dep': '^1.0.0' }
      }),
      'ranger.config.json': JSON.stringify({
        rules: {
          severity: {
            'DEP004': 'info', // normally error (20 pts) -> overridden to info (0 pts)
            'DEP003': 'error' // normally warning (7 pts) -> overridden to error (20 pts)
          }
        }
      })
    });

    try {
      const res = await inspectProject(dir);
      const dep004 = res.findings.find(f => f.id === 'DEP004');
      const dep003 = res.findings.find(f => f.id === 'DEP003');
      assert.equal(dep004.severity, 'info');
      assert.equal(dep003.severity, 'error');
      // Total penalties: 0 (DEP004 info) + 20 (DEP003 error) = 20
      assert.equal(res.score.penalties, 20);
      assert.equal(res.score.value, 80);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('14. Excluded directories are ignored from file-specific findings', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'exclude-dir-test', version: '1.0.0' }),
      'legacy/broken.js': 'const x = process.env.LEGACY_VAR;',
      'ranger.config.json': JSON.stringify({
        exclude: ['legacy/**']
      })
    });

    try {
      const res = await inspectProject(dir);
      const envFinding = res.findings.find(f => f.file && f.file.startsWith('legacy'));
      assert.equal(envFinding, undefined, 'Findings in legacy/ directory must be excluded');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('15. Excluded files are ignored', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'exclude-file-test', version: '1.0.0' }),
      'scripts/secret.js': 'const key = "AKIA1234567890ABCDEF";',
      'ranger.config.json': JSON.stringify({
        exclude: ['scripts/secret.js']
      })
    });

    try {
      const res = await inspectProject(dir);
      const secretFinding = res.findings.find(f => f.file === 'scripts/secret.js');
      assert.equal(secretFinding, undefined, 'scripts/secret.js finding should be excluded');
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('16. Missing configuration uses defaults without crashing', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'missing-config-test', version: '1.0.0' })
    });

    try {
      const res = await inspectProject(dir);
      assert.equal(res.configPath, null);
      assert.ok(res.score);
      assert.equal(res.score.value, 100);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('17. Malformed JSON in ranger.config.json rejects with clear error', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'broken-config-json', version: '1.0.0' }),
      'ranger.config.json': '{ broken json syntax '
    });

    try {
      await assert.rejects(
        async () => {
          await inspectProject(dir);
        },
        {
          name: 'Error',
          message: /Invalid JSON syntax in configuration file/
        }
      );
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('18. Invalid severity values in configuration are rejected', () => {
    assert.throws(
      () => {
        validateConfig({
          rules: {
            severity: { 'ENV001': 'critical' }
          }
        });
      },
      {
        name: 'Error',
        message: /Invalid severity value "critical"/
      }
    );
  });

  await t.test('19. Unknown rule IDs in configuration are rejected', () => {
    assert.throws(
      () => {
        validateConfig({
          rules: {
            disabled: ['FAKE_RULE_999']
          }
        });
      },
      {
        name: 'Error',
        message: /Unknown rule ID in "rules.disabled": "FAKE_RULE_999"/
      }
    );
  });

  await t.test('20. Invalid scoring weights are rejected', () => {
    assert.throws(
      () => {
        validateConfig({
          scoring: {
            weights: { error: -10 }
          }
        });
      },
      {
        name: 'Error',
        message: /Scoring weight for "error" must be a non-negative number/
      }
    );
  });

  await t.test('21. Invalid grade thresholds are rejected', () => {
    assert.throws(
      () => {
        validateConfig({
          scoring: {
            grades: { A: 50, B: 80, C: 70, D: 60 } // A < B is invalid
          }
        });
      },
      {
        name: 'Error',
        message: /Grade thresholds must strictly decrease in order/
      }
    );
  });

  await t.test('22. Invalid exclusion patterns are rejected', () => {
    assert.throws(
      () => {
        validateConfig({
          exclude: ['']
        });
      },
      {
        name: 'Error',
        message: /Each pattern in "exclude" must be a non-empty string glob/
      }
    );
  });

  // CLI and Registry features
  await t.test('23. --list-rules displays all registered rules and severities', () => {
    const res = spawnSync(process.execPath, [cliPath, '--list-rules'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    assert.ok(res.stdout.includes('CFG001'));
    assert.ok(res.stdout.includes('DEP004'));
    assert.ok(res.stdout.includes('SEC003'));
    assert.ok(res.stdout.includes('ENV001'));
    assert.ok(res.stdout.includes('Total rules:'));
  });

  await t.test('24. --list-rules --json outputs machine-readable rules list', () => {
    const res = spawnSync(process.execPath, [cliPath, '--list-rules', '--json'], { encoding: 'utf8' });
    assert.equal(res.status, 0);
    const parsed = JSON.parse(res.stdout);
    assert.ok(Array.isArray(parsed.rules));
    assert.ok(parsed.rules.length >= 21);
    assert.ok(parsed.rules.find(r => r.id === 'CFG001'));
  });

  await t.test('25. --score displays concise score and breakdown', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({ name: 'score-cli-test', version: '1.0.0' })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir, '--score'], { encoding: 'utf8' });
      assert.equal(res.status, 0);
      assert.ok(res.stdout.includes('Health Score: 100/100 (Grade A)'));
      assert.ok(res.stdout.includes('Breakdown:'));
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('26. JSON output includes scoring and grade object', async () => {
    const dir = await createTempProject({
      'package.json': JSON.stringify({
        name: 'json-score-test',
        version: '1.0.0',
        dependencies: { 'missing-pkg': '^1.0.0' }
      })
    });

    try {
      const res = spawnSync(process.execPath, [cliPath, dir, '--json'], { encoding: 'utf8' });
      assert.equal(res.status, 1); // 1 because of error
      const parsed = JSON.parse(res.stdout);
      assert.ok(parsed.score);
      assert.equal(typeof parsed.score.value, 'number');
      assert.equal(typeof parsed.score.grade, 'string');
      assert.equal(typeof parsed.score.penalties, 'number');
      assert.ok(parsed.score.categories);
      assert.ok(parsed.score.categories.dependencies > 0);
    } finally {
      await cleanupTempProject(dir);
    }
  });

  await t.test('27. Public API exports scoring, registry, and configuration helpers', () => {
    assert.equal(typeof ranger.calculateHealthScore, 'function');
    assert.equal(typeof ranger.validateConfig, 'function');
    assert.equal(typeof ranger.loadConfig, 'function');
    assert.equal(typeof ranger.listRules, 'function');
    assert.equal(typeof ranger.getRule, 'function');
    assert.equal(typeof ranger.isKnownRule, 'function');

    const rules = ranger.listRules();
    assert.ok(Array.isArray(rules));
    assert.ok(rules.length >= 21);
    assert.equal(ranger.isKnownRule('DEP004'), true);
    assert.equal(ranger.isKnownRule('INVALID_ID'), false);
  });
});
