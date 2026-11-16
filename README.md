# Ranger

A lightweight health inspector for JavaScript and Node.js projects.

Ranger scans your project to identify configuration problems, dependency issues, environment inconsistencies, security risks, and other common development issues before they reach production.

## Features (Planned)

- **Dependencies**: Detects missing packages, lockfile inconsistencies, and outdated or duplicate dependencies.
- **Environment**: Verifies Node.js engine compatibility, required environment variables, and OS settings.
- **Security**: Flags committed secrets, vulnerable dependencies, and unsafe package configurations.
- **Configuration**: Checks `package.json` syntax, essential project files (`.gitignore`, engine configurations), and best practices.

## Installation & CLI Usage

Run directly with `npx` (no permanent install required):

```bash
npx ranger
```

Scan a specific project directory:

```bash
npx ranger .
npx ranger /path/to/project
```

Or install globally:

```bash
npm install -g ranger
ranger
```

## Programmatic Usage

Ranger provides a programmatic API for integration into CI/CD pipelines, build scripts, or developer tooling:

```javascript
const { run, rules } = require('ranger');

async function inspectProject() {
  const result = await run({
    cwd: process.cwd()
  });

  console.log(result);
}

inspectProject();
```

## Architecture

The project is structured with modularity and extensibility in mind:

```text
ranger/
├── src/
│   ├── rules/            # Modular diagnostic rules
│   │   ├── dependencies.js
│   │   ├── environment.js
│   │   ├── security.js
│   │   └── configuration.js
│   ├── cli.js            # Executable CLI entry point
│   └── index.js          # Core public API
├── test/
│   └── cli.test.js       # Native test suites
├── README.md
├── .gitignore
└── package.json
```

- **CLI Layer (`src/cli.js`)**: Independent command-line runner responsible for argument handling, formatting, and exit codes.
- **Core API (`src/index.js`)**: Decoupled engine boundary allowing programmatic execution.
- **Diagnostic Rules (`src/rules/*`)**: Self-contained, isolated rule modules implementing a common diagnostic interface.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Running Tests

Ranger uses Node.js native test runner (`node:test`):

```bash
npm test
```

## License

[MIT](LICENSE)
