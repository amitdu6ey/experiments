# Pokemon Browser

A clean, single-page Pokemon browser built with vanilla JavaScript and the free [PokeAPI](https://pokeapi.co/). Browse the full Pokedex, view detailed stats, and bookmark your favourite Pokemon — no account or API key needed.

## Features

- Browse Pokemon with infinite scroll / pagination
- View full details: type, stats, abilities, height, weight, and official artwork
- Bookmark favourites — persisted in `localStorage` so they survive page refresh
- Filter view to show only bookmarked Pokemon
- Responsive layout — works on desktop and mobile

## Getting Started

No installation required. Just open `index.html` in any modern browser:

```bash
# Option 1 — open directly
open index.html

# Option 2 — serve locally (avoids any CORS edge cases)
npx serve .
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Language | Vanilla JavaScript (ES6+) |
| Markup | HTML5 |
| Styles | CSS3 (custom properties, flexbox, grid) |
| API | [PokeAPI v2](https://pokeapi.co/) (free, no auth) |
| Storage | `localStorage` for bookmarks |

## Project Structure

```
pokemon/
├── index.html   # App shell and markup
├── style.css    # All styles
└── app.js       # All application logic
```

## API Attribution

Pokemon data provided by [PokeAPI](https://pokeapi.co/) — a free, open RESTful Pokémon API.
