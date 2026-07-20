# The MaskLife Game Collection

The collection has four locked titles:

1. **Veilbound** — a finished hidden-information card game about asking for masked identities, banking matching Echoes, and racing to seven Bounds.
2. **Realm Roll** — a finished fantasy Skee-Ball game with target selection, power and accuracy timing, three-round matches, and Sudden Roll tiebreakers.
3. **Kings Cups** — an original cup-pong game. Its production phase must include tap-first aiming, believable ball physics, solo AI, local play, private two-device play, tutorials, and complete match flows.
4. **Wicked Words** — an original fill-in-the-blank party card game with two separately selectable libraries: regular and age-gated 18+. It must use original prompts and responses rather than copying another game’s cards.

Veilbound and Realm Roll are implemented as standalone clients, deterministic rules engines, save namespaces, online room services, and test suites. Names and the concepts above are locked; unapproved mechanics are not treated as final designs.

## Shared systems

- Collection home and game library navigation
- MaskLife message-attachment launch and private invitation flow
- Shared player profiles and accessibility preferences
- Unified audio and haptic service
- Save-slot registry with a unique namespace per game
- Shared botanical theme tokens, modal shell, buttons, and device-safe layout
- Achievement and cross-game chronicle model
- Shared online presence, reconnection, room expiration, and abuse-reporting services

## Wicked Words content boundaries

- The regular library must stay broadly social and suitable for mixed groups.
- The 18+ library must require an explicit age confirmation before it can be selected or joined.
- Invitations must identify the active content rating before a guest joins.
- Hosts need content controls, player removal, reporting, and a quick exit.
- User-created text must be escaped, length-limited, and covered by moderation and block lists.
- Adult content may be suggestive or profane, but it must exclude minors, sexual violence, non-consensual sexual content, exploitation, and targeted hateful abuse.

## Required isolation

Each game must keep its own:

- Rules engine and automated tests
- Save-state version
- AI logic
- Game-specific art folder
- How-to-play content
- Match history and scoring model

No empty or “coming soon” buttons are shown in the product library. Kings Cups and Wicked Words should appear only when each one is playable end to end.
