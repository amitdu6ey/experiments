# Agent Instructions — AI Experiments Monorepo

This file is automatically read by AI coding agents (Claude Code, Copilot, etc.) to understand the repository layout and working conventions.

## Repo Purpose

This is a **monorepo** for personal AI-assisted experiments. Each top-level folder is an independent project with its own stack, dependencies, and README.

## Project Isolation Rules

- **Never** modify files outside the project directory you are working in.
- Each project is self-contained. Do not share code, utilities, or config across projects unless explicitly instructed.
- Each project may have its own `CLAUDE.md` with project-specific instructions — always read that file first before making changes inside a project folder.

## Directory Layout

```
experiments/
├── CLAUDE.md       ← you are here (repo-level agent instructions)
├── README.md       ← human-facing repo overview
└── <project>/
    ├── CLAUDE.md   ← project-level agent instructions (read first!)
    └── README.md   ← human-facing project overview
```

## General Coding Conventions

- Prefer **vanilla JS / HTML / CSS** for simple front-end projects unless a framework is clearly justified.
- Use **free, public APIs** with no authentication required where possible.
- Keep projects runnable by opening `index.html` directly in a browser (no build step required unless noted).
- Do not introduce package managers, bundlers, or build tools unless the project README calls for them.
- Do not add files outside the relevant project folder.

## Git Conventions

- Commit messages should be short and descriptive (imperative mood).
- Do not push to `main` directly — use feature branches.
- Do not create pull requests unless explicitly asked.

## What Not To Do

- Do not install global packages or modify system configuration.
- Do not add `.env` files with real secrets to the repository.
- Do not refactor or "clean up" code in projects you are not currently working in.
