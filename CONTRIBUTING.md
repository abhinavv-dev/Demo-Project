# Contributing to Devora

Thank you for your interest in contributing to Devora! Devora (CLI binary: `ranger`) is an open-source, zero-dependency Node.js project diagnostics and code health inspection tool.

---

## 1. Development Environment & Prerequisites

- **Node.js**: Node.js `>=18.0.0` (active LTS versions 18, 20, or 22 recommended).
- **Git**: Git `>=2.20`.
- **Operating Systems**: macOS, Linux (Ubuntu/Debian), or Windows.
- **Dependencies Philosophy**: **Zero external runtime dependencies**. Ranger exclusively utilizes Node.js standard library built-ins (`node:fs`, `node:path`, `node:child_process`, `node:module`). External packages must not be added to `dependencies`.

---

## 2. Repository Setup & Workflow

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/abhinavv-dev/ranger.git
   cd ranger
   ```

2. **Verify Environment**:
   Run the native test suite to ensure your environment is clean:
   ```bash
   npm test
   ```

3. **Check Code Formatting**:
   Ensure Git diff formatting has no trailing whitespace:
   ```bash
   git diff --check
   ```

---

## 3. Project Directory Architecture

```text
ranger/
├── .github/
│   └── workflows/
│       └── ci.yml                 # Multi-OS & multi-version CI test matrix
├── src/
│   ├── rules/                     # Diagnostic rule modules
│   │   ├── configuration.js       # CFG001–CFG009 (package.json, entry points, engines)
│   │   ├── dependencies.js        # DEP001–DEP005 (integrity, lockfiles, unused/missing)
│   │   ├── environment.js         # ENV001–ENV004 (.env.example, undocumented keys)
│   │   └── security.js            # SEC001–SEC003 (secret scanning, tracked credentials)
│   ├── formatters/
│   │   ├── args.js                # CLI argument parser and help generator
│   │   ├── colors.js              # ANSI color support and NO_COLOR detection
│   │   ├── json.js                # Unadorned JSON formatter for machine consumption
│   │   └── terminal.js            # Polished terminal table and report generator
│   ├── utils/
│   │   └── fs.js                  # Safe file traversal, pattern matching, dynamic import analysis
│   ├── cli.js                     # CLI executable entry point
│   ├── config.js                  # ranger.config.json discovery and validation
│   ├── engine.js                  # Inspection orchestration engine
│   ├── index.js                   # Public programmatic API exports
│   ├── registry.js                # Rule registry and metadata lookup
│   └── scoring.js                 # Deterministic health scoring algorithm (0–100)
├── test/
│   └── cli.test.js                # Comprehensive automated tests (Node native test runner)
├── CONTRIBUTING.md                # Contributor guidelines
├── package.json                   # Package definition and npm whitelist
└── README.md                      # Comprehensive developer documentation
```

---

## 4. How Diagnostic Rules Are Organized

Every diagnostic rule module exports an object conforming to the diagnostic rule interface:

```javascript
module.exports = {
  name: 'category_name',       // String category name
  category: 'category_name',   // Must match name ('configuration' | 'dependencies' | 'environment' | 'security')
  description: 'Rule summary', // Human-readable description

  /**
   * Run the diagnostic checks.
   *
   * @param {Object} context
   * @param {string} context.projectRoot - Absolute path to target project
   * @param {Object} context.config - Validated configuration object
   * @param {Map<string, string[]>} [context.fileCache] - Per-run memoization cache
   * @returns {Promise<Array<Object>>} Array of finding objects
   */
  async run(context = {}) {
    const findings = [];
    // ... diagnostic logic
    return findings;
  }
};
```

### Finding Object Structure

Each returned finding object must contain:

- `id`: Stable rule identifier string (e.g. `DEP004`, `CFG006`).
- `category`: Category name (`configuration`, `dependencies`, `environment`, `security`).
- `severity`: Severity string (`error`, `warning`, `info`).
- `title`: Short title summarizing the condition.
- `message`: Specific description of the detected condition.
- `file`: Relative file path with POSIX slashes (`/`), or `null` if project-wide.
- `recommendation`: Actionable guidance for the developer to resolve the issue.
- `fixable`: Boolean indicating whether the issue can be automatically resolved.

---

## 5. Adding a New Diagnostic Rule

1. **Assign a Stable Rule ID**:
   - `CFGxxx` for project configuration and metadata.
   - `DEPxxx` for dependencies and lockfiles.
   - `ENVxxx` for environment variables and templates.
   - `SECxxx` for secrets, credentials, and sensitive files.
2. **Register the Rule in `src/registry.js`**:
   Add the rule metadata to the `RULES` array in [src/registry.js](file:///Users/abhinav/Desktop/NPM%20PACKAGE/src/registry.js).
3. **Implement Rule Logic**:
   Add the diagnostic logic to the appropriate module in `src/rules/`.
4. **Write Tests**:
   Add unit and integration tests in `test/cli.test.js` covering both positive (issue present) and negative (clean project) cases.
5. **Update Documentation**:
   Add the new rule ID to the rule tables in `README.md`.

---

## 6. Testing Expectations

All tests use Node.js's built-in test runner (`node:test`) and assertion library (`node:assert`):

```bash
# Run test suite
npm test

# Verify npm packaging whitelist
npm pack --dry-run
```

- **Zero Skipped Tests**: Never commit `.skip` or `.todo` tests without an explicit issue link.
- **Isolation**: Temporary test projects must be created using `fs.mkdtempSync` and cleaned up in `finally` blocks.
- **Cross-Platform**: Do not assume POSIX-only paths in assertions. Always normalize paths or use `path.join`.

---

## 7. Pull Request & Commit Guidelines

1. **Branch Naming**: Use descriptive branch names:
   - `feat/feature-name`
   - `fix/bug-description`
   - `docs/improvement-summary`
2. **Commit Messages**: Follow standard Conventional Commits:
   - `feat(scope): short description`
   - `fix(scope): short description`
   - `docs: update API documentation`
3. **Pre-PR Checklist**:
   - [ ] `npm test` passes completely (100% passing tests).
   - [ ] `git diff --check` reports zero whitespace errors.
   - [ ] `npm pack --dry-run` contains only intended files.
   - [ ] Zero external runtime dependencies added.

---

## 8. Reporting Bugs

If you discover a bug or security concern:
- Open an issue at [https://github.com/abhinavv-dev/ranger/issues](https://github.com/abhinavv-dev/ranger/issues).
- Provide Node.js version (`node -v`), operating system, and reproduction steps or sample project.
- **Security Vulnerabilities**: Please report sensitive credential leaks or security concerns responsibly via private vulnerability reporting on GitHub.

