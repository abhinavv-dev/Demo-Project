# Ranger

A lightweight health inspector for JavaScript and Node.js projects.

Ranger scans your project to identify configuration problems, dependency issues, environment inconsistencies, security risks, and other common development issues before they reach production.

## Features

- **Dependencies**: Detects missing installed packages, empty/invalid versions, missing lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), and unreferenced dependency candidates.
- **Environment**: Verifies `.env.example` existence, highlights undocumented variables used in source code, flags unused template entries, and alerts if `.env` files are tracked in Git.
- **Security**: Detects tracked private keys (`.pem`, `.key`, `id_rsa`) and credential files in Git, and flags potential hardcoded secrets (such as AWS keys and private key headers) without ever leaking secret values.
- **Configuration**: Validates `package.json` syntax, required metadata (`name`, `version`), `scripts` structure, `engines.node` runtime compatibility, and verifies that configured `main` and `bin` entry points actually exist on disk.

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
| `--json` | Output diagnostic findings as clean, machine-readable JSON. |
| `--no-color` | Disable terminal color output (also respects `NO_COLOR` environment variable). |
| `-h, --help` | Display usage information and available options. |
| `-v, --version` | Display installed version. |

### Terminal Output

Ranger formats findings with a clean, readable terminal hierarchy:

```text
RANGER v0.2.0 — Project Health Inspector
────────────────────────────────────────────────────────────
Project:   my-node-app
Target:    /Users/developer/my-node-app

WARNINGS (1)
  ▲ [ENV001] Missing environment template file
    Message:        Environment variables are referenced in project source code, but no .env.example or template file exists.
    Recommendation: Create a .env.example file documenting all required environment variables with placeholder values.

────────────────────────────────────────────────────────────
Summary:  0 errors  •  1 warning  •  0 notices (scanned in 45ms)
Status:   Passed with warnings — consider addressing suggested improvements
```

### JSON Output Mode (`--json`)

Ideal for CI/CD pipelines, pre-commit hooks, and programmatic integration:

```bash
npx ranger --json
```

```json
{
  "project": {
    "name": "my-node-app",
    "path": "/Users/developer/my-node-app"
  },
  "summary": {
    "total": 1,
    "errors": 0,
    "warnings": 1,
    "info": 0
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

## Programmatic API

Ranger can be consumed directly inside Node.js scripts or build tools:

```javascript
const { inspectProject } = require('ranger');

async function runCheck() {
  const result = await inspectProject(process.cwd());

  console.log(`Scan completed in ${result.duration}ms`);
  console.log(`Total findings: ${result.summary.total}`);

  for (const finding of result.findings) {
    console.log(`[${finding.severity.toUpperCase()}] ${finding.id}: ${finding.title}`);
  }
}

runCheck();
```

## Exit Code Behavior

- **Exit code `0`**: Inspection completed with no critical errors (0 errors; warnings or informational notices may still be present).
- **Exit code `1`**: One or more critical diagnostic errors were detected (e.g. missing dependencies, broken `package.json`, missing `main` file), or a command execution failure occurred (e.g. directory not found, invalid arguments).

## Current Limitations

- **Dynamic Imports**: Dependencies loaded dynamically via computed string expressions (e.g., `require('prefix-' + name)`) cannot be statically matched and are reported as informational unused candidates (`DEP005`).
- **Git Metadata**: Git-dependent checks (`SEC001`, `SEC002`, `ENV004`) require repository metadata and the `git` CLI; if Git is unavailable or the directory is not a repository, these checks are skipped gracefully without failing the inspection.

## Development & Testing

Ranger uses Node.js native test runner (`node:test`):

```bash
npm test
```

## License

[MIT](LICENSE)
