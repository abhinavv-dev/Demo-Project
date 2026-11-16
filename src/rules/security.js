'use strict';

const path = require('node:path');
const fsp = require('node:fs').promises;
const {
  walkFiles,
  getGitTrackedFiles
} = require('../utils/fs');

// Patterns for potential credentials
const SECRET_PATTERNS = [
  {
    type: 'private_key_header',
    title: 'Potential private key header',
    regex: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP|ENCRYPTED)?\s*PRIVATE\s+KEY-----/i,
    extractValue: false
  },
  {
    type: 'aws_access_key',
    title: 'Potential AWS Access Key ID',
    regex: /\b(AKIA[0-9A-Z]{16})\b/,
    extractValue: true
  },
  {
    type: 'generic_api_key_assignment',
    title: 'Potential hardcoded API key assignment',
    regex: /(?:api_?key|apiKey|secret_?key|secretKey|access_?token|accessToken|auth_?token)\s*[:=]\s*['"`]([A-Za-z0-9_\-]{16,})['"`]/i,
    extractValue: true
  },
  {
    type: 'hardcoded_password_assignment',
    title: 'Potential hardcoded password assignment',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^\s'"`]{8,})['"`]/i,
    extractValue: true
  }
];

// Sensitive file names when tracked in version control
const SENSITIVE_FILE_PATTERNS = [
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i,
  /\.p12$/i,
  /^id_rsa$/i,
  /^id_dsa$/i,
  /^id_ecdsa$/i,
  /^id_ed25519$/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i
];

/**
 * Check if an extracted value represents an obvious dummy, test, or example placeholder.
 *
 * @param {string} value
 * @returns {boolean}
 */
function isDummyCredential(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }
  const lower = value.toLowerCase();
  const dummyTokens = [
    'dummy',
    'example',
    'fake',
    'mock',
    'placeholder',
    'sample',
    'test_secret',
    'testsecret',
    'your_',
    'your-',
    'change_me',
    'changeme',
    'xxx',
    '12345678'
  ];

  return dummyTokens.some(token => lower.includes(token));
}

const securityRule = {
  name: 'security',
  category: 'security',
  description: 'Inspects potential secret exposure, tracked sensitive files, and credentials',

  /**
   * Run the security diagnostic check.
   *
   * @param {Object} context
   * @param {string} context.projectRoot
   * @returns {Promise<Array<Object>>}
   */
  async run(context = {}) {
    const { projectRoot } = context;
    const findings = [];

    const trackedFiles = getGitTrackedFiles(projectRoot);

    // A & C: Sensitive files and exposed environment files in Git
    if (trackedFiles) {
      for (const relFile of trackedFiles) {
        const baseName = path.basename(relFile);
        const lowerBaseName = baseName.toLowerCase();

        // Check for tracked .env files (security check)
        const isEnvFile = lowerBaseName === '.env' || lowerBaseName.startsWith('.env.');
        const isTemplate = lowerBaseName.includes('example') ||
                           lowerBaseName.includes('sample') ||
                           lowerBaseName.includes('template') ||
                           lowerBaseName.includes('dist');

        if (isEnvFile && !isTemplate) {
          findings.push({
            id: 'SEC001',
            category: 'security',
            severity: 'error',
            title: 'Sensitive environment file tracked in Git',
            message: `File "${relFile}" appears to be a sensitive environment file tracked in version control.`,
            file: relFile,
            recommendation: `Untrack "${relFile}" using "git rm --cached ${relFile}" and add it to .gitignore.`,
            fixable: false
          });
        }

        // Check for sensitive private key or credential files
        for (const pattern of SENSITIVE_FILE_PATTERNS) {
          if (pattern.test(baseName)) {
            // Allow explicit template/example files
            if (isTemplate) {
              continue;
            }
            findings.push({
              id: 'SEC002',
              category: 'security',
              severity: 'error',
              title: 'Sensitive credential or key file tracked in Git',
              message: `File "${relFile}" matches sensitive key or credential patterns and is tracked in Git.`,
              file: relFile,
              recommendation: `Remove "${relFile}" from Git immediately and rotate any credentials it contains.`,
              fixable: false
            });
            break;
          }
        }
      }
    }

    // B: Potential hardcoded secret exposure in source files
    // Scan project files across the project (including test/fixture files), ignoring node_modules, dist, etc.
    const sourceFiles = await walkFiles(projectRoot, {
      extensions: new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.json', '.yaml', '.yml'])
    });

    for (const filePath of sourceFiles) {
      const relPath = path.relative(projectRoot, filePath);

      let content;
      try {
        content = await fsp.readFile(filePath, 'utf8');
      } catch {
        continue;
      }

      for (const patternObj of SECRET_PATTERNS) {
        const match = patternObj.regex.exec(content);
        if (match) {
          if (patternObj.extractValue) {
            const captured = match[1];
            // If the matched credential is an obvious dummy/example, skip it
            if (isDummyCredential(captured)) {
              continue;
            }
          }

          findings.push({
            id: 'SEC003',
            category: 'security',
            severity: 'warning',
            title: patternObj.title,
            message: `File "${relPath}" contains a potential hardcoded credential (${patternObj.type}). Never commit secrets into source code.`,
            file: relPath,
            recommendation: `Move the credential to an environment variable and reference it via process.env instead of hardcoding.`,
            fixable: false
          });
          // Report once per matching pattern per file
          break;
        }
      }
    }

    return findings;
  }
};

module.exports = securityRule;
