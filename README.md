# Ranger

A lightweight health inspector for JavaScript and Node.js projects.

Ranger scans your project to identify configuration problems, dependency issues, environment inconsistencies, security risks, and other common development issues before they reach production. Every completed inspection produces a deterministic **Health Score (0–100)** and a corresponding **Letter Grade (A–F)**.

## Features

- **Health Scoring & Letter Grades**: Deterministic 0–100 score and letter grade based on detected issues.
- **Project Configuration (`ranger.config.json`)**: Disable individual rules, override severities, exclude files or folders via glob patterns, and customize scoring penalties and grade thresholds.
- **Dependencies**: Detects missing installed packages, empty/invalid versions, missing lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), and unreferenced dependency candidates. Automatically handles monorepo workspaces (npm/yarn/pnpm), hoisted root dependencies, scoped packages, and subpath imports.
- **Environment**: Verifies `.env.example` existence, highlights undocumented variables used in source code, flags unused template entries, and alerts if `.env` files are tracked in Git.
- **Security**: Detects tracked private keys (`.pem`, `.key`, `id_rsa`) and credential files in Git, and flags potential hardcoded secrets (such as AWS keys and private key headers) without ever leaking secret values.
- **Configuration**: Validates `package.json` syntax, required metadata (`name`, `version`), `scripts` structure, `engines.node` runtime compatibility, and verifies that configured `main` and `bin` entry points actually exist on disk.
- **Reliability & Monorepo Intelligence**: Built-in module filtering prevents false alarms on Node.js built-ins (`fs`, `node:test`, `path`), circular and broken symlinks are handled gracefully, path normalization ensures cross-platform consistency (Windows/macOS/Linux), and dynamic imports are treated conservatively.

---

## Health Scoring Engine

Every inspection calculates a health score representing detected issues across enabled rules:

$$\text{score} = \max(0, 100 - \text{total penalties})$$

### Default Penalty Weights

| Finding Severity | Default Penalty |
|---|---|
| **Error** | 20 points |
| **Warning** | 7 points |
| **Info** | 0 points |

### Default Letter Grade Thresholds

| Score Range | Grade | Description |
|---|---|---|
| **90 – 100** | **A** | Excellent project hygiene |
| **80 – 89** | **B** | Good health with minor warnings |
| **70 – 79** | **C** | Noticeable issues or configuration gaps |
| **60 – 69** | **D** | Significant warnings or errors present |
| **0 – 59** | **F** | Critical errors require immediate attention |

> Note: The health score is a local code hygiene metric representing issues detected by Ranger's enabled rules, not an absolute guarantee of software quality or security.

---

## Project Configuration (`ranger.config.json`)

Ranger automatically discovers `ranger.config.json` in your project root, or accepts an explicit path via `--config <path>`.

### Example `ranger.config.json`

```json
{
  "rules": {
    "disabled": [
      "DEP005"
    ],
    "severity": {
      "ENV001": "info",
      "SEC003": "error"
    }
  },
  "exclude": [
    "examples/**",
    "generated/**",
    "coverage/**"
  ],
  "scoring": {
    "weights": {
      "error": 25,
      "warning": 8,
      "info": 0
    },
    "grades": {
      "A": 90,
      "B": 80,
      "C": 70,
      "D": 60
    }
  }
}
```

### Configuration Controls

1. **Rule Disabling (`rules.disabled`)**: An array of rule IDs to suppress. Disabled rules do not produce findings and do not reduce the health score.
2. **Severity Overrides (`rules.severity`)**: Map rule IDs to `"error"`, `"warning"`, or `"info"` to adjust severity and impact on scoring.
3. **File Exclusions (`exclude`)**: Glob patterns to ignore (e.g. `["coverage/**", "legacy/broken.js"]`).
4. **Scoring Customization (`scoring.weights` & `scoring.grades`)**: Custom penalty point deductions and grade threshold cutoffs.

### Strict Validation

Ranger validates configuration strictly. Unknown rule IDs, invalid severities, malformed glob patterns, or inverted grade thresholds immediately produce clear, actionable error messages instead of producing misleading health scores.

---

## Installation & CLI Usage

Run directly via `npx` (no installation required):

```bash
npx ranger
```

Scan a specific project path:

```bash
npx ranger .
npx ranger /path/to/project
```

Or install globally:

```bash
npm install -g ranger
ranger
```

### Command-Line Options

| Option | Description |
| :--- | :--- |
| `[path]` | Target directory to inspect (defaults to current working directory). |
| `--config <path>` | Explicit path to a `ranger.config.json` configuration file. |
| `--score` | Display concise health score, grade, and summary breakdown. |
| `--list-rules` | List all available diagnostic rules, IDs, categories, and default severities. |
| `--json` | Output diagnostic findings and score as machine-readable JSON. |
| `--no-color` | Disable terminal color output (also respects `NO_COLOR` environment variable). |
| `-h, --help` | Display usage information and available options. |
| `-v, --version` | Display installed version. |

### Terminal Output

```text
RANGER v0.3.0 — Project Health Inspector
────────────────────────────────────────────────────────────
Project:      my-node-app
Target:       /Users/developer/my-node-app
Health Score: 93/100 — Grade A

WARNINGS (1)
  ▲ [ENV001] Missing environment template file
    Message:        Environment variables are referenced in project source code, but no .env.example or template file exists.
    Recommendation: Create a .env.example file documenting all required environment variables with placeholder values.

────────────────────────────────────────────────────────────
Summary:     0 errors  •  1 warning  •  0 notices (scanned in 45ms)
Status:      Passed with warnings — consider addressing suggested improvements
```

### Concise Score Mode (`--score`)

```bash
npx ranger --score
```

```text
RANGER v0.3.0 — my-node-app
Health Score: 93/100 (Grade A)
Breakdown:    0 errors, 1 warning, 0 notices (45ms)
```

### List Diagnostic Rules (`--list-rules`)

```bash
npx ranger --list-rules
```

```text
RANGER — Available Diagnostic Rules
──────────────────────────────────────────────────────────────────────────
ID         CATEGORY         DEFAULT    TITLE
──────────────────────────────────────────────────────────────────────────
CFG001     configuration    error      Missing package.json
CFG002     configuration    error      Invalid package.json structure or syntax
CFG003     configuration    error      Missing or empty package name
CFG004     configuration    error      Missing or empty package version
CFG005     configuration    error      Invalid scripts definition
CFG006     configuration    info       Missing Node.js engine compatibility requirement
CFG007     configuration    warning    Outdated Node.js engine requirement
CFG008     configuration    error      Missing main entry point file
CFG009     configuration    error      Missing executable bin file
DEP001     dependencies     error      Invalid dependencies definition
DEP002     dependencies     error      Invalid dependency version
DEP003     dependencies     warning    Missing dependency lockfile
DEP004     dependencies     error      Missing installed dependency
DEP005     dependencies     info       Unused dependency candidate
ENV001     environment      warning    Missing environment template file
ENV002     environment      warning    Undocumented environment variable
ENV003     environment      info       Unused template environment variable
ENV004     environment      error      Tracked environment file in Git
SEC001     security         error      Sensitive environment file tracked in Git
SEC002     security         error      Sensitive credential or key file tracked in Git
SEC003     security         warning    Potential hardcoded credential or secret
──────────────────────────────────────────────────────────────────────────
Total rules: 21
```

### JSON Output Mode (`--json`)

```bash
npx ranger --json
```

```json
{
  "project": {
    "name": "my-node-app",
    "path": "/Users/developer/my-node-app"
  },
  "configPath": "/Users/developer/my-node-app/ranger.config.json",
  "summary": {
    "total": 1,
    "errors": 0,
    "warnings": 1,
    "info": 0
  },
  "score": {
    "value": 93,
    "grade": "A",
    "penalties": 7,
    "categories": {
      "dependencies": 0,
      "environment": 7,
      "security": 0,
      "configuration": 0
    }
  },
  "findings": [
    {
      "id": "ENV001",
      "category": "environment",
      "severity": "warning",
      "title": "Missing environment template file",
      "message": "Environment variables are referenced in project source code, but no .env.example or template file exists.",
      "file": null,
      "recommendation": "Create a .env.example file documenting all required environment variables with placeholder values.",
      "fixable": false
    }
  ],
  "duration": 45
}
```

---

## Programmatic API

Ranger can be consumed directly inside Node.js scripts, build pipelines, or CI/CD tools:

```javascript
const { inspectProject, listRules } = require('ranger');

async function runCheck() {
  const result = await inspectProject(process.cwd(), {
    configPath: './ranger.config.json'
  });

  console.log(`Project: ${result.project.name}`);
  console.log(`Health Score: ${result.score.value}/100 (Grade ${result.score.grade})`);
  console.log(`Total findings: ${result.summary.total}`);

  for (const finding of result.findings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.id}: ${finding.title}`);
  }
}

runCheck();
```

---

## Exit Code Behavior

- **Exit code `0`**: Inspection completed with no critical errors (0 errors; warnings or informational notices may still be present).
- **Exit code `1`**: One or more critical diagnostic errors were detected (e.g. missing dependencies, broken `package.json`, missing `main` file), or a command execution failure occurred (e.g. invalid configuration, directory not found, invalid arguments).

---

## Current Limitations & Notes

- **Dynamic Imports**: Dependencies loaded via computed string expressions (e.g., `require('prefix-' + name)` or `import(dynamicPath)`) cannot be statically matched. To avoid false alarms, Ranger conservatively suppresses unused dependency candidate warnings (`DEP005`) when dynamic loading expressions are detected.
- **Monorepos & Workspaces**: In monorepo setups (`workspaces` in root `package.json`), dependencies hoisted to the root `node_modules` or declared by sibling workspace packages are recognized automatically.
- **Git Metadata Dependency**: Git-dependent checks (`SEC001`, `SEC002`, `ENV004`) require repository metadata and the `git` CLI; if Git is unavailable or the directory is not a repository, these checks are skipped gracefully without failing the inspection.

---

## Development & Testing

Ranger uses the Node.js native test runner (`node:test`):

```bash
npm test
```

## License

[MIT](LICENSE)
