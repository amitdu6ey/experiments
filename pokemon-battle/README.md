# Pokedex Battle

A turn-based Pokemon battle game built with vanilla JavaScript and the free [PokeAPI](https://pokeapi.co/). Pick a team of three from the original 151, then fight trainer after trainer and see how long your win streak lasts.

## Features

- Team select with search and a favourites filter (shares the `pokedex_bookmarks` list with the `pokemon` project)
- Real stats, types and moves from PokeAPI; four random damaging moves per Pokemon
- Gen 5-style damage formula with the full type chart, same-type bonus, critical hits and accuracy
- Fight, Potion (3 per battle), Switch and Run (blocked, as in the games)
- Win streaks: your team gains 2 levels per win, the enemy gains 4; best streak is saved
- Animated sprites, particle effects, screen shake, four arena backdrops
- Sound effects synthesized with the Web Audio API (no audio files); mute button included

## Getting Started

No installation required. Open `index.html` in a modern browser, or serve it locally:

```bash
npx serve .
```

An internet connection is needed for PokeAPI data and sprites.

## Tech Stack

Vanilla JS (ES6+), HTML5, CSS3. No build step, no dependencies.
