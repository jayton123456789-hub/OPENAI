# Veilbound

Veilbound is a complete portrait-first card game about masked identities, hidden information, and memory. Players inquire after identities already held in their hand, collect the four Echoes of each identity, and bind more complete identities than their rivals.

When a rival has none of the requested identity, the official response is:

> **Draw from the Veil.**

## Finished first-edition features

- Complete 52-card rules engine with 13 identities and four Echoes per identity
- Solo play against three fair AI difficulty levels
- Two-to-four-player pass-and-play with private handoff curtains
- Full title, mode selection, setup, rules, pause, settings, history, results, rematch, and chronicle flows
- Automatic binding, empty-hand recovery, ties, end-game scoring, and edge-case handling
- Local autosave and one-tap continuation after closing or refreshing the app
- Optional sound, haptics, reduced motion, and enlarged cards
- Responsive mobile-first interface with touch and keyboard accessibility
- Original generated botanical artwork, masked portrait set, and card-back design
- Deterministic engine tests, including a complete AI-vs-AI match simulation

## Run locally

```bash
npm install
npm run dev
```

## Validate

```bash
npm run lint
npm test
```

## Project structure

- `app/veilbound-game.tsx` — complete interactive game application
- `lib/veilbound.ts` — deterministic rules engine and AI decision system
- `public/assets/` — optimized runtime artwork
- `art-source/generated/` — source generations retained in the primary project checkout
- `docs/` — rules, art direction, and expansion architecture
- `tests/game.test.mjs` — rules and full-match regression tests

The game is intentionally isolated as its own component and engine so a shared game hub and three companion games can be added without rewriting Veilbound.
