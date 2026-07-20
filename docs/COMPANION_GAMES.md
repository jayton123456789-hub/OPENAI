# Companion Game Architecture

Veilbound is the first of four games planned for the same collection. Its implementation is split into a standalone client component, rules engine, runtime artwork, local save namespace, and documentation so three later games can be mounted beside it cleanly.

## Shared systems to extract when Game Two begins

- Collection home and game library navigation
- Shared player profiles and accessibility preferences
- Unified audio and haptic service
- Save-slot registry with a unique namespace per game
- Shared botanical theme tokens, modal shell, buttons, and device-safe layout
- Achievement and cross-game chronicle model

## Required isolation

Each game must keep its own:

- Rules engine and automated tests
- Save-state version
- AI logic
- Game-specific art folder
- How-to-play content
- Match history and scoring model

No empty or “coming soon” buttons are shown in Veilbound First Edition. Companion entries should appear only when they are playable.
