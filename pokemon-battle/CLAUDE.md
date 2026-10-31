# Agent Instructions — Pokedex Battle

## Project Overview

A static, single-page Pokemon battle game. Uses the free [PokeAPI](https://pokeapi.co/) for data and its GitHub sprite repository for images. No API key required.

## Stack

- Vanilla JavaScript (ES6+), plain HTML5, plain CSS3
- No build step, no dependencies, no bundler

## File Structure

```
pokemon-battle/
├── CLAUDE.md    ← agent instructions (this file)
├── README.md    ← human-facing docs
├── index.html   ← three screens: title, team select, battle
├── style.css    ← all styles
└── app.js       ← all application logic
```

## Key Conventions

- All JavaScript lives in `app.js`; all styles live in `style.css`.
- Audio is synthesized with the Web Audio API. Do not add audio files.
- Favourites use the `pokedex_bookmarks` localStorage key (shared with the `pokemon` project). Best streak uses `pokebattle_best`.
- Pokemon limited to ids 1–151. Animated sprites come from the PokeAPI sprites repo, with static PNG fallback.
- The app must work by opening `index.html` directly in a browser.
