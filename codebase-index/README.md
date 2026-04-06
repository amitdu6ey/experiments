# codebase-index

A zero-dependency CLI that scans any project and generates a `CODEBASE_INDEX.md` — a compact, structured map of your codebase that AI tools (GitHub Copilot, Claude, etc.) can read to navigate directly to the parts that matter, without scanning every file.

## The Problem

When you open a large project in an AI-assisted editor, the AI has to infer structure by reading many files. This is slow and often misses important context. `codebase-index` solves this by generating a single document that acts as a **table of contents + API reference + flag registry** for your project.

## How It Works

1. Run the CLI against any project directory
2. It walks the file tree, extracts symbols (functions, classes, exports), and collects `@flag` annotations
3. Outputs a `CODEBASE_INDEX.md` in the target directory
4. Open that file in your editor — Copilot now has a complete map

## Usage

```bash
# Scan current directory
node /path/to/codebase-index/index.js

# Scan a specific project
node /path/to/codebase-index/index.js /path/to/your/project

# Or if installed globally
codebase-index /path/to/your/project
```

## Flagging Important Code

Add `@flag` annotations anywhere in your source to mark sections as important:

```js
// @flag: main authentication entry point
function authenticate(user, password) { ... }

// @flag: critical — do not modify without review
const RATE_LIMIT = 100;
```

```python
# @flag: core business logic
def calculate_pricing(order):
    ...
```

```html
<!-- @flag: root app shell -->
<div id="app"></div>
```

These appear in the **Flagged Sections** table of the index with file path and line number, so an AI can jump straight to them.

## What Gets Extracted

| Category | Details |
|----------|---------|
| Entry points | `index.*`, `main.*`, `app.*`, `server.*`, `cli.*` |
| JS/TS symbols | `export function`, `export class`, `export const`, top-level `function`, `class` |
| Python symbols | `def`, `class` at module level |
| Go symbols | `func`, `type` |
| `@flag` annotations | Any file, any language — with line numbers |

## Output Format

```
CODEBASE_INDEX.md
├── Summary (file count, flag count, entry points)
├── Entry Points table
├── Flagged Sections table  ← what Copilot uses most
├── Public Symbols table
├── File Tree
└── Per-file details (symbols + flags with line numbers)
```

## Installation

No install required — just run with Node.js (v14+):

```bash
node index.js [target-dir]
```

To use as a global command:

```bash
npm install -g /path/to/codebase-index
codebase-index [target-dir]
```
