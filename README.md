# Devora (`devora`)

A lightweight health inspector for JavaScript and Node.js projects.

Devora scans your project to identify configuration problems, dependency issues, environment inconsistencies, security risks, and code hygiene gaps before they reach production. Every completed inspection produces a deterministic **Health Score (0–100)**, a corresponding **Letter Grade (A–F)**, and actionable diagnostic findings.

Devora requires **zero external dependencies**, runs natively on **Node.js >=18**, and is designed for individual developers, team code reviews, CI/CD automation, and GitHub Actions workflows.

---

## Table of Contents

- [Why Devora?](#why-devora)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command-Line Interface (CLI)](#command-line-interface-cli)
  - [CLI Options](#cli-options)
  - [Exit Code Contract](#exit-code-contract)
  - [Concise Score Mode](#concise-score-mode---score)
  - [JSON Output Mode](#json-output-mode---json)
  - [Listing Available Rules](#listing-available-rules---list-rules)
- [CI/CD & GitHub Actions Integration](#cicd--github-actions-integration)
  - [GitHub Actions Workflow Example](#github-actions-workflow-example)
  - [Configuring Failure Thresholds](#configuring-failure-thresholds)
- [Health Scoring Engine](#health-scoring-engine)
  - [Penalty Weights](#penalty-weights)
  - [Letter Grade Thresholds](#letter-grade-thresholds)
- [Diagnostic Rule Categories](#diagnostic-rule-categories)
- [Project Configuration (`devora.config.json`)](#project-configuration-devoraconfigjson)
  - [Configuration Example](#configuration-example)
  - [Configuration Schema & Properties](#configuration-schema--properties)
- [Programmatic API](#programmatic-api)
  - [JavaScript CommonJS Usage](#javascript-commonjs-usage)
  - [Result Object Structure](#result-object-structure)
- [Compatibility & Platforms](#compatibility--platforms)
- [Development & Testing](#development--testing)
- [Current Limitations & Design Notes](#current-limitations--design-notes)
- [Contributing](#contributing)
- [License](#license)

---

## Why Devora?

Modern JavaScript projects frequently suffer from subtle configuration and hygiene drift:
- Unused or undeclared packages lurking in `package.json`.
- Missing dependency lockfiles causing non-deterministic builds.
- Missing environment variable templates (`.env.example`) that stall new contributors.
- Undocumented environment variables referenced across source code.
- Accidental commits of secret keys or sensitive configuration files into Git.
- Broken entry points (`main` or `bin` pointing to non-existent files).
- Missing Node.js runtime engine constraints.

Devora provides an instant, zero-setup sanity check that diagnoses these issues in milliseconds.

---

## Key Features

- **Project Health Scoring**: Deterministic 0–100 health score with letter grades (A through F) reflecting project health.
- **Configurable Rules & Thresholds**: Customize penalty deductions, severity levels, rule exclusions, and grade thresholds in `devora.config.json` (also supports backwards-compatible `ranger.config.json`).
- **CI/CD Ready**: Configurable failure thresholds via `--fail-on <severity>` and standardized exit codes (0, 1, 2).
- **Monorepo & Workspaces Support**: Automatically resolves hoisted dependencies and root lockfiles for npm, yarn, and pnpm workspaces.
- **Filesystem & Symlink Resilience**: Built-in protection against circular symlinks, permission errors, and symlink traversal escapes.
- **Accurate Dependency Diagnostics**: Distinguishes static imports, dynamic computed imports, npm script invocations, and Node.js built-ins (`fs`, `node:test`, `path`).
- **Secret & Credential Protection**: Flags potential hardcoded secrets (AWS keys, private key headers) and sensitive files without ever leaking credential values in terminal or JSON output.
- **Zero Runtime Dependencies**: Uses Node.js built-in modules exclusively (`node:fs`, `node:path`, `node:child_process`).

---

## Installation

### Run Directly via `npx` (Recommended)

No installation required:

```bash
npx devora
```

### Global Installation

```bash
npm install -g devora
devora
```

### Local Development Dependency

```bash
npm install --save-dev devora
```

Add to your `package.json` scripts:

```json
{
  "scripts": {
    "doctor": "devora",
    "check:health": "devora --fail-on warning"
  }
}
```

---

## Quick Start

Inspect the current working directory:

```bash
npx devora
```

Inspect a specific directory:

```bash
npx devora ./my-project
```

Run in strict CI mode (fails if any warnings or errors exist):

```bash
npx devora --fail-on warning
```

Output machine-readable JSON for scripting or pipeline aggregation:

```bash
npx devora --json
```

---

## Command-Line Interface (CLI)

```text
USAGE:
  devora [path] [options]
  npx devora [path] [options]

ARGUMENTS:
  [path]                 Target project directory (defaults to current directory)

OPTIONS:
  --config <path>        Explicit path to devora.config.json
  --fail-on <severity>   Set failure threshold for CI exit code: error, warning, info
  --json                 Output findings and score as machine-readable JSON
  --score                Display health score and summary in a concise format
  --list-rules           List all available diagnostic rules and default severities
  --no-color             Disable terminal colors (also respects NO_COLOR env)
  -h, --help             Display this help message
  -v, --version          Display the installed version
```

### Exit Code Contract

Devora follows standard UNIX and CI/CD process exit codes:

| Exit Code | Meaning | Condition |
| :---: | :--- | :--- |
| **`0`** | **Success** | Inspection completed cleanly; no findings reached the failure threshold. |
| **`1`** | **Threshold Reached** | Diagnostic findings reached or exceeded the configured failure threshold. |
| **`2`** | **Execution Error** | Invalid CLI arguments, missing configuration files, or unreadable project paths. |

#### Behavior with `--fail-on <severity>`

- `--fail-on error` *(Default)*: Exits with code `1` if at least 1 `error` finding is present.
- `--fail-on warning`: Exits with code `1` if at least 1 `warning` or `error` finding is present.
- `--fail-on info`: Exits with code `1` if any finding (`info`, `warning`, or `error`) is present.
- Without `--fail-on`: Exits with code `1` on errors, `0` otherwise.

### Concise Score Mode (`--score`)

Provides a minimal one-line status summary:

```bash
npx devora --score
```

```text
DEVORA v0.3.0 — my-node-app
Health Score: 93/100 (Grade A)
Breakdown:    0 errors, 1 warning, 0 notices (45ms)
```

### JSON Output Mode (`--json`)

Emits structured, unadorned JSON directly to `stdout`. Diagnostic banners and ANSI escapes are omitted automatically:

```bash
npx devora --json
```

```json
{
  "project": {
    "name": "my-node-app",
    "path": "/Users/developer/my-node-app"
  },
  "configPath": "/Users/developer/my-node-app/devora.config.json",
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

### Listing Available Rules (`--list-rules`)

Inspect all 21 built-in diagnostic rules and their default severity ratings:

```bash
npx devora --list-rules
```

Or as JSON:

```bash
npx devora --list-rules --json
```

---

## CI/CD & GitHub Actions Integration

Devora is engineered for continuous integration environments. It runs without an interactive TTY, respects standard environment variables (`CI=true`, `NO_COLOR=1`), and provides deterministic exit codes.

### GitHub Actions Workflow Example

Create `.github/workflows/health.yml` in your repository:

```yaml
name: Project Health Check

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  devora:
    name: Devora Health Inspection
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Run Devora Health Inspection
        run: npx devora --fail-on warning
```

### Automated Failure Thresholds

Select the threshold matching your team's code review standard:

- **Strict Quality Gate**: Fail on warnings to enforce complete documentation and zero hygiene issues:
  ```bash
  npx devora --fail-on warning
  ```
- **Standard Gate**: Fail only on blocking structural defects (missing dependencies, broken entry points):
  ```bash
  npx devora --fail-on error
  ```
- **Non-blocking Informational Step**: Always succeed the pipeline while recording findings in job logs:
  ```bash
  npx devora || true
  ```

---

## Health Scoring Engine

Every inspection calculates a deterministic health score from 0 to 100 based on detected issues across all active rules:

$$\text{score} = \max\left(0,\, 100 - \sum \text{penalties}\right)$$

### Penalty Weights

| Finding Severity | Default Penalty Deduction | Description |
| :--- | :---: | :--- |
| **Error** | **20 points** | Critical problems (missing dependencies, broken `package.json`, missing `main`). |
| **Warning** | **7 points** | Configuration gaps (missing `.env.example`, uncommitted lockfile, hardcoded credential pattern). |
| **Info** | **0 points** | Informational notices (unused dependency candidate, missing engine range). |

### Letter Grade Thresholds

| Score Range | Grade | Health Rating | Action |
| :---: | :---: | :--- | :--- |
| **90 – 100** | **A** | **Excellent** | Clean configuration; project meets high standards. |
| **80 – 89** | **B** | **Good** | Minor warnings or documentation gaps present. |
| **70 – 79** | **C** | **Fair** | Noticeable hygiene issues; review recommended before release. |
| **60 – 69** | **D** | **Poor** | Significant errors or multiple warnings require remediation. |
| **0 – 59** | **F** | **Critical** | Critical errors present; immediate attention required. |

---

## Diagnostic Rule Categories

Devora includes 21 built-in diagnostic rules across four categories:

### 1. Configuration (`configuration`)
- `CFG001`: Missing `package.json` file.
- `CFG002`: Invalid JSON syntax or top-level structure in `package.json`.
- `CFG003`: Missing or empty package `name`.
- `CFG004`: Missing or empty package `version`.
- `CFG005`: Invalid `scripts` definition in `package.json`.
- `CFG006`: Missing `engines.node` runtime compatibility field.
- `CFG007`: Outdated Node.js runtime engine constraint (<18).
- `CFG008`: Missing `main` entry point target file on disk.
- `CFG009`: Missing executable `bin` target file on disk.

### 2. Dependencies (`dependencies`)
- `DEP001`: Invalid dependency group definition (must be key-value object).
- `DEP002`: Empty or malformed dependency version range.
- `DEP003`: Missing lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`).
- `DEP004`: Missing installed package in `node_modules` (monorepo-aware).
- `DEP005`: Unused dependency candidate in production `dependencies`.

### 3. Environment (`environment`)
- `ENV001`: Missing `.env.example` or template file when source references `process.env`.
- `ENV002`: Undocumented environment variable used in source code but missing from template.
- `ENV003`: Unreferenced template environment variable never accessed in source code.
- `ENV004`: Sensitive environment file (`.env`) tracked in Git version control.

### 4. Security (`security`)
- `SEC001`: Sensitive environment configuration tracked in Git.
- `SEC002`: Sensitive private key or credential file (`.pem`, `.key`, `id_rsa`) tracked in Git.
- `SEC003`: Potential hardcoded secret or API key assignment in source code.

---

## Project Configuration (`devora.config.json`)

Customize Devora for your repository by placing `devora.config.json` (or `ranger.config.json`) in your project root, or specify an explicit configuration path via `--config <path>`.

### Configuration Example

```json
{
  "rules": {
    "disabled": [
      "DEP005"
    ],
    "severity": {
      "ENV001": "error",
      "CFG006": "warning"
    }
  },
  "exclude": [
    "fixtures/**",
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

### Configuration Schema & Properties

1. **`rules.disabled`** *(Array of Strings)*:
   List of rule IDs to suppress entirely. Disabled rules are not evaluated and do not deduct points.
2. **`rules.severity`** *(Object mapping Rule ID to `"error" | "warning" | "info"`)*:
   Override the default severity of individual rules to adjust their penalty deduction.
3. **`exclude`** *(Array of Glob Strings)*:
   Exclude files or directories matching patterns from file-specific findings (e.g. `fixtures/**`, `dist/**`).
4. **`scoring.weights`** *(Object)*:
   Custom penalty deduction values for `error`, `warning`, and `info`.
5. **`scoring.grades`** *(Object)*:
   Custom minimum threshold cutoffs for letter grades `A`, `B`, `C`, and `D`. Thresholds must strictly decrease ($A > B > C > D$).

---

## Programmatic API

Devora exports a full programmatic JavaScript API for custom tooling, developer portals, or build scripts.

### JavaScript CommonJS Usage

```javascript
const { inspectProject, listRules, calculateHealthScore } = require('devora');

async function checkHealth() {
  const result = await inspectProject(process.cwd(), {
    configPath: './devora.config.json'
  });

  console.log(`Project:      ${result.project.name}`);
  console.log(`Health Score: ${result.score.value}/100 (Grade ${result.score.grade})`);
  console.log(`Findings:     ${result.summary.total} (Errors: ${result.summary.errors}, Warnings: ${result.summary.warnings})`);

  for (const finding of result.findings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.id}: ${finding.title}`);
    if (finding.file) {
      console.log(`  File: ${finding.file}`);
    }
    console.log(`  Recommendation: ${finding.recommendation}`);
  }
}

checkHealth();
```

### Result Object Structure

```typescript
interface InspectionResult {
  project: {
    name: string;
    path: string;
  };
  configPath: string | null;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    info: number;
  };
  score: {
    value: number;       // 0 to 100
    grade: string;       // 'A' | 'B' | 'C' | 'D' | 'F'
    penalties: number;   // Total penalty points deducted
    categories: {
      dependencies: number;
      environment: number;
      security: number;
      configuration: number;
    };
  };
  findings: Array<{
    id: string;
    category: 'configuration' | 'dependencies' | 'environment' | 'security';
    severity: 'error' | 'warning' | 'info';
    title: string;
    message: string;
    file: string | null;
    recommendation: string;
    fixable: boolean;
  }>;
  duration: number;      // Execution time in milliseconds
}
```

---

## Compatibility & Platforms

- **Node.js**: Node.js `>=18.0.0` (tested on Node.js 18, 20, 22, and 24).
- **Operating Systems**: macOS, Ubuntu / Linux, Windows (handles Windows-style `\` path separators, drive letters, and POSIX path normalization).
- **Package Managers**: npm, yarn, pnpm.
- **Module System**: CommonJS (`require` / `module.exports`).

---

## Development & Testing

Devora uses Node.js native test runner (`node:test`):

```bash
# Run complete test suite
npm test

# Verify package inclusion rules
npm pack --dry-run

# Verify formatting
git diff --check
```

---

## Current Limitations & Design Notes

- **Dynamic Imports**: Dependencies loaded via arbitrary computed expressions (e.g. `require(variable)`) cannot be statically resolved. Devora conservatively avoids flagging matching packages as unused candidates (`DEP005`).
- **Git Metadata Dependency**: Version control rules (`SEC001`, `SEC002`, `ENV004`) require repository metadata and the `git` binary. In non-git environments or release tarballs, these rules skip gracefully without failing the inspection.
- **Local Code Quality**: The health score reflects code hygiene and project configuration integrity; it is not a formal substitute for automated security penetration testing or full vulnerability CVE scans.

---

## Contributing

Contributions, bug reports, and suggestions are welcome!

1. Fork the repository: [https://github.com/abhinavv-dev/ranger](https://github.com/abhinavv-dev/ranger).
2. Create your feature branch (`git checkout -b feature/my-feature`).
3. Ensure all tests pass (`npm test`) and maintain zero external dependencies.
4. Open a pull request.

---

## License

This project is licensed under the [MIT License](LICENSE).
