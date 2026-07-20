# MaskLife Games

MaskLife Games is a portrait-first mobile game collection. The current release includes two complete titles: **Veilbound**, a hidden-information card game about masked identities, and **Realm Roll**, a fantasy Skee-Ball duel built around target selection and two-tap timing.

## Realm Roll 1.0

- Three rounds with five balls per player, followed by Sudden Roll tiebreakers when needed
- Seven physical scoring targets: 10, 20, 30, 40, 50, and two difficult 100-point Dragon Gates
- Tap a target, lock power, then lock accuracy—no dragging
- Deterministic ball flight with visible impacts, neighboring-ring catches, clear misses, and score receipts
- Solo play against one or two pressure-aware AI rivals at Novice, Adept, or Royal difficulty
- Two-to-four-player pass-and-play with private handoff curtains
- Private two-device invitations with server-authoritative rolls and hidden random state
- Complete eight-step tutorial, rules, pause, settings, shot history, rematch, and Chronicle flows
- Sound, haptic, high-contrast, and reduced-motion options
- Responsive fantasy cabinet, ramp, ball-flight, target, and celebration animations

## Veilbound Second Edition 2.0

Veilbound is a complete card game about asking for masked identities, deciding when to protect matching cards in a public Bank, and racing to seven Bounds. When a rival has none of the requested identity, the official response is:

When a rival has none of the requested identity, the official response is:

> **Draw from the Veil.**

### Features

- Familiar 52-card identity cycle backed by an endless central Veil that automatically reshuffles
- Deliberate risk-and-reward Bank: pairs score 1 Bound, trios score 2, and four-card sets score 3
- First-to-seven victory condition with permanent public score tracks
- Solo play with one or two fair AI rivals across three difficulty levels
- Private two-device invitations with synchronized turns and no account requirement
- Two-to-four-player pass-and-play with private handoff curtains
- Nine-step guided tutorial with interactive Ask and multi-card Bank practice
- Separate Ask and Bank modes with tap-to-select, tap-to-stage, and clear confirmation actions
- Hands grouped visually by identity for quick scanning on narrow phone screens
- Animated draw, transfer, Bank, score, public-event, and Continue Turn / End Turn receipts
- Full title, mode selection, setup, rules, pause, settings, history, results, rematch, and chronicle flows
- Empty-hand recovery, unlimited draw cycles, immediate seven-Bound victory, and edge-case handling
- Local autosave and one-tap continuation after closing or refreshing the app
- Optional sound, haptics, reduced motion, and enlarged cards
- Responsive mobile-first interface with touch and keyboard accessibility
- Original generated botanical artwork, masked portrait set, and card-back design
- Deterministic engine tests, including complete local and privacy-sanitized online match simulations

## Collection roadmap

The four locked titles are **Veilbound**, **Realm Roll**, **Kings Cups**, and **Wicked Words**. Kings Cups will be an original cup-pong game. Wicked Words will be an original fill-in-the-blank party card game with separate regular and age-gated 18+ decks. Unfinished games remain absent from the playable library until they work end to end.

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

- `app/collection-home.tsx` — collection library and navigation
- `app/veilbound-game.tsx` and `app/realm-roll-game.tsx` — complete interactive game clients
- `lib/veilbound.ts` and `lib/realm-roll.ts` — deterministic rules engines and AI systems
- `lib/online-room*.ts` and `lib/realm-online-room*.ts` — private online view models and services
- `app/api/rooms/` and `app/api/realm-rooms/` — private multiplayer endpoints
- `db/` and `drizzle/` — D1 room schema and migration
- `public/assets/` — optimized runtime artwork
- `art-source/generated/` — source generations retained in the primary project checkout
- `docs/` — rules, art direction, and expansion architecture
- `tests/game.test.mjs` and `tests/realm-roll.test.mjs` — rules and full-match regression tests

Each title is isolated behind its own component, engine, save state, online room, and tests so future games can join the shared library without destabilizing the finished releases.
