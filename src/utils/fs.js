'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'coverage',
  'dist',
  'build',
  '.nyc_output',
  '.cache',
  '.idea',
  '.vscode'
]);

const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.json']);

/**
 * Check if a file or directory exists.
 *
 * @param {string} targetPath
 * @returns {Promise<boolean>}
 */
async function exists(targetPath) {
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely parse a JSON file.
 * Returns null if file does not exist, or throws SyntaxError if invalid.
 *
 * @param {string} filePath
 * @returns {Promise<{ content: any, raw: string }>}
 */
async function readJsonFile(filePath) {
  const raw = await fsp.readFile(filePath, 'utf8');
  const content = JSON.parse(raw);
  return { content, raw };
}

/**
 * Read text file safely, returning empty string or null on failure.
 *
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function readTextFile(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Walk directory recursively while ignoring specified directories and avoiding symlink loops.
 *
 * @param {string} dir
 * @param {Object} [options]
 * @param {Set<string>} [options.ignoreDirs]
 * @param {Set<string>} [options.extensions]
 * @param {Set<string>} [options.visited]
 * @returns {Promise<string[]>} List of absolute file paths.
 */
async function walkFiles(dir, options = {}) {
  const ignoreDirs = options.ignoreDirs || DEFAULT_IGNORE_DIRS;
  const extensions = options.extensions || null;
  const visited = options.visited || new Set();

  const results = [];

  let realPath;
  try {
    realPath = await fsp.realpath(dir);
  } catch {
    return results;
  }

  if (visited.has(realPath)) {
    return results;
  }
  visited.add(realPath);

  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const entryName = entry.name;
    const fullPath = path.join(dir, entryName);

    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entryName) && !entryName.startsWith('.git')) {
        const subFiles = await walkFiles(fullPath, { ignoreDirs, extensions, visited });
        results.push(...subFiles);
      }
    } else if (entry.isSymbolicLink()) {
      try {
        const stat = await fsp.stat(fullPath);
        if (stat.isDirectory()) {
          if (!ignoreDirs.has(entryName) && !entryName.startsWith('.git')) {
            const subFiles = await walkFiles(fullPath, { ignoreDirs, extensions, visited });
            results.push(...subFiles);
          }
        } else if (stat.isFile()) {
          const ext = path.extname(entryName);
          if (!extensions || extensions.has(ext)) {
            results.push(fullPath);
          }
        }
      } catch {
        // Skip broken symlinks
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entryName);
      if (!extensions || extensions.has(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Collect all tracked files from git if repository is available.
 * Returns null if Git is not installed or repo is not a git repository.
 *
 * @param {string} projectRoot
 * @returns {string[]|null} Relative paths of tracked files or null.
 */
function getGitTrackedFiles(projectRoot) {
  try {
    const output = execFileSync('git', ['ls-files'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    return output.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Parse an .env or .env.example file into a Set of variable names.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
function parseEnvKeys(content) {
  const keys = new Set();
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return keys;
}

/**
 * Scan source files to extract referenced process.env variable names.
 * Matches process.env.VAR and process.env['VAR'] or process.env["VAR"].
 *
 * @param {string[]} filePaths
 * @returns {Promise<Map<string, Set<string>>>} Map of varName -> Set of relative file paths.
 */
async function extractEnvReferences(filePaths, projectRoot) {
  const envRefs = new Map();
  const dotPattern = /\bprocess\.env\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  const bracketPattern = /\bprocess\.env\[['"`]([A-Za-z_][A-Za-z0-9_]*)['"`]\]/g;

  for (const filePath of filePaths) {
    let content;
    try {
      content = await fsp.readFile(filePath, 'utf8');
    } catch {
      continue;
    }

    const relPath = path.relative(projectRoot, filePath);
    let match;

    dotPattern.lastIndex = 0;
    while ((match = dotPattern.exec(content)) !== null) {
      const varName = match[1];
      if (!envRefs.has(varName)) {
        envRefs.set(varName, new Set());
      }
      envRefs.get(varName).add(relPath);
    }

    bracketPattern.lastIndex = 0;
    while ((match = bracketPattern.exec(content)) !== null) {
      const varName = match[1];
      if (!envRefs.has(varName)) {
        envRefs.set(varName, new Set());
      }
      envRefs.get(varName).add(relPath);
    }
  }

  return envRefs;
}

/**
 * Extract imported/required module names from JS/TS source code.
 *
 * @param {string} content
 * @returns {Set<string>}
 */
function extractImportSpecifiers(content) {
  const specifiers = new Set();

  // require('specifier')
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    specifiers.add(match[1]);
  }

  // import ... from 'specifier' or import 'specifier'
  const importRegex = /\bimport\s*(?:(?:[\w*\s{},]*)\s*from\s*)?['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(content)) !== null) {
    specifiers.add(match[1]);
  }

  // dynamic import('specifier')
  const dynamicImportRegex = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    specifiers.add(match[1]);
  }

  // export ... from 'specifier'
  const exportRegex = /\bexport\s*(?:[\w*\s{},]*)\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = exportRegex.exec(content)) !== null) {
    specifiers.add(match[1]);
  }

  return specifiers;
}

/**
 * Normalize an import specifier to its package name (e.g. '@scoped/pkg/foo' -> '@scoped/pkg', 'lodash/get' -> 'lodash').
 * Returns null if specifier is relative or native node: module.
 *
 * @param {string} specifier
 * @returns {string|null}
 */
function getPackageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) {
    return null;
  }
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return specifier;
  }
  return parts[0];
}

module.exports = {
  DEFAULT_IGNORE_DIRS,
  JS_EXTENSIONS,
  exists,
  readJsonFile,
  readTextFile,
  walkFiles,
  getGitTrackedFiles,
  parseEnvKeys,
  extractEnvReferences,
  extractImportSpecifiers,
  getPackageNameFromSpecifier
};
