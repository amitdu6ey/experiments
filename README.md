# AI Experiments Monorepo

A personal monorepo for AI-assisted experiments, prototypes, and explorations. Each project lives in its own directory with a self-contained codebase, dependencies, and documentation.

## Structure

```
experiments/
├── README.md          # This file
├── CLAUDE.md          # Agent instructions for this repo
└── pokemon/           # Pokemon browser using the free PokeAPI
    ├── README.md
    ├── index.html
    ├── style.css
    └── app.js
```

## Projects

| Project | Description | Stack |
|---------|-------------|-------|
| [pokemon](./pokemon) | Browse, view details, and bookmark Pokemon using the free PokeAPI | Vanilla JS, HTML, CSS |

## Conventions

- Each project is fully self-contained within its folder.
- Projects use free/open APIs where possible — no paid keys required to run.
- Each project has its own `README.md` with setup and usage instructions.

## Getting Started

Navigate into any project folder and follow its `README.md`. Most projects are static and can be opened directly in a browser or served with any static file server:

```bash
cd pokemon
npx serve .
# or simply open index.html in your browser
```

## Contributing

This is a personal experiments repo. Feel free to fork and adapt any project for your own use.
