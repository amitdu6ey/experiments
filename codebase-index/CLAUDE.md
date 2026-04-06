# Agent Instructions — codebase-index

## Purpose

A zero-dependency Node.js CLI that scans any project directory and generates
a `CODEBASE_INDEX.md` — a compact, AI-readable map of the codebase. Intended
to help AI tools (Copilot, Claude, etc.) navigate large projects without
scanning every file.

## Stack

- Node.js built-ins only (`fs`, `path`) — no npm dependencies
- Single entry point: `index.js`
- Runs as: `node index.js [target-dir]` or `./index.js [target-dir]`

## File Structure

```
codebase-index/
├── CLAUDE.md      ← agent instructions (this file)
├── README.md      ← human-facing docs
├── package.json   ← bin entry + metadata only, no deps
└── index.js       ← entire CLI implementation
```

## Key Conventions

- All logic lives in `index.js`. Do not split into multiple files.
- No external dependencies — use only Node.js built-ins.
- Output file is always named `CODEBASE_INDEX.md` written to the target dir.
- Flag annotation supported in source files: `// @flag: <description>`
- Supports JS, TS, JSX, TSX, Python, Go, Java, Ruby, Rust, C/C++, HTML, CSS.

## Flag Annotation Syntax (for users to use in their code)

| Language | Syntax |
|----------|--------|
| JS/TS/Go/Java/C | `// @flag: description` |
| Python/Ruby/bash | `# @flag: description` |
| HTML | `<!-- @flag: description -->` |
| CSS | `/* @flag: description */` |
