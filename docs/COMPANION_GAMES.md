# The MaskLife Game Collection

The collection has four locked titles:

1. **Veilbound** — a finished hidden-information card game about asking for masked identities, banking matching Echoes, and racing to seven Bounds.
2. **Realm Roll** — the next title reserved for a dice-led realm game; its final rules and visual identity will be designed as a separate production phase.
3. **Kings Cups** — the third title, reserved for a social card experience with its own rules, safety options, and tutorial.
4. **Wicked Words** — the fourth title, reserved for a fast word game with its own dictionary, moderation, scoring, and AI requirements.

Veilbound is implemented as a standalone client, deterministic rules engine, runtime art set, save namespace, online room service, and documentation so the other titles can be mounted beside it without destabilizing a finished game. Names are locked; unapproved mechanics are not treated as final designs.

## Shared systems to extract when Game Two begins

- Collection home and game library navigation
- MaskLife message-attachment launch and private invitation flow
- Shared player profiles and accessibility preferences
- Unified audio and haptic service
- Save-slot registry with a unique namespace per game
- Shared botanical theme tokens, modal shell, buttons, and device-safe layout
- Achievement and cross-game chronicle model
- Shared online presence, reconnection, room expiration, and abuse-reporting services

## Required isolation

Each game must keep its own:

- Rules engine and automated tests
- Save-state version
- AI logic
- Game-specific art folder
- How-to-play content
- Match history and scoring model

No empty or “coming soon” buttons are shown in Veilbound Second Edition. Realm Roll, Kings Cups, and Wicked Words should appear in the product only when each one is playable end to end.
