# Agent Instructions — Pokemon Project

## Project Overview

A static, single-page web app that lets users browse Pokemon, view their details, and bookmark favourites. It uses the free [PokeAPI](https://pokeapi.co/) — no API key required.

## Stack

- Vanilla JavaScript (ES6+)
- Plain HTML5
- Plain CSS3
- No build step, no dependencies, no bundler

## File Structure

```
pokemon/
├── CLAUDE.md    ← agent instructions (this file)
├── README.md    ← human-facing docs
├── index.html   ← app entry point
├── style.css    ← all styles
└── app.js       ← all application logic
```

## Key Conventions

- All JavaScript lives in `app.js`. Do not split into multiple JS files.
- All styles live in `style.css`. Do not use inline styles.
- Bookmarks are persisted via `localStorage` — no backend.
- API base URL: `https://pokeapi.co/api/v2/`
- Do not add a package.json, node_modules, or any build tooling.
- The app must work by opening `index.html` directly in a browser.

## API Usage

- Pokemon list: `GET https://pokeapi.co/api/v2/pokemon?limit=20&offset=0`
- Pokemon detail: `GET https://pokeapi.co/api/v2/pokemon/{name}`
- Sprite image: `data.sprites.other['official-artwork'].front_default`
