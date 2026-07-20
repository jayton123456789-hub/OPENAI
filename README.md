# Veilbound

Veilbound is a complete portrait-first card game about masked identities, hidden information, and memory. Players inquire after identities already held in their hand, collect the four Echoes of each identity, and bind more complete identities than their rivals.

When a rival has none of the requested identity, the official response is:

> **Draw from the Veil.**

## Finished First Edition 1.2 features

- Complete 52-card rules engine with 13 identities and four Echoes per identity
- Solo play with one or two fair AI rivals across three difficulty levels
- Private two-device invitations with synchronized turns and no account requirement
- Two-to-four-player pass-and-play with private handoff curtains
- Seven-step guided tutorial with an interactive practice hand
- Clear tap-place-ask turns: tap a card, tap the center seal, then confirm the inquiry
- Animated card receipts, bindings, public events, and explicit Continue Turn / End Turn handoffs
- Full title, mode selection, setup, rules, pause, settings, history, results, rematch, and chronicle flows
- Automatic binding, empty-hand recovery, ties, end-game scoring, and edge-case handling
- Local autosave and one-tap continuation after closing or refreshing the app
- Optional sound, haptics, reduced motion, and enlarged cards
- Responsive mobile-first interface with touch and keyboard accessibility
- Original generated botanical artwork, masked portrait set, and card-back design
- Deterministic engine tests, including complete local and privacy-sanitized online match simulations

## Collection

Veilbound is the first playable title in the planned MaskLife game collection: **Veilbound**, **Realm Roll**, **Kings Cups**, and **Wicked Words**. The companion titles remain intentionally absent from the interface until each is fully designed and playable.

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
- `lib/online-room.ts` — private per-seat online view model
- `lib/online-room-server.ts` — server-authoritative invitation and turn service
- `app/api/rooms/` — create, join, reconnect, and action endpoints
- `db/` and `drizzle/` — D1 room schema and migration
- `public/assets/` — optimized runtime artwork
- `art-source/generated/` — source generations retained in the primary project checkout
- `docs/` — rules, art direction, and expansion architecture
- `tests/game.test.mjs` — rules and full-match regression tests

The game is intentionally isolated as its own component and engine so Realm Roll, Kings Cups, and Wicked Words can join a shared game hub without rewriting Veilbound.
