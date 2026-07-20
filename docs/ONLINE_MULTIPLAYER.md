# Veilbound Private Invitation Architecture

## Player flow

1. The host enters a display name and creates a room.
2. Veilbound returns a private invitation URL containing a six-character room code and a guest seat key.
3. The host sends that URL through a private MaskLife message, text, or chat.
4. The invited player chooses a display name and claims the second seat.
5. The game begins automatically. Each device polls the authoritative room state and can reconnect with its locally saved seat key.

Anyone who possesses an unused invitation can take the second seat, so the interface explicitly tells players to send it only to their intended opponent.

## Privacy and authority

- Raw host and guest keys are returned only to their respective devices and stored as SHA-256 hashes in D1.
- Every inquiry is validated on the server for seat, turn, target, identity, and room version.
- Optimistic version updates prevent two simultaneous actions from both changing the same turn.
- The server sends a player their own hand, both public hand counts and bindings, the remaining deck count, and public history.
- Opponent cards and undealt card identities are removed before serialization.
- Rooms expire seven days after creation.

## Persistence

The `online_rooms` D1 table stores room status, display names, hashed seat keys, serialized authoritative game state, an optimistic version, and timestamps. The migration is in `drizzle/0000_skinny_nomad.sql`.

## Verification

- Deterministic tests play complete matches without deadlock.
- Privacy assertions inspect both sanitized seat views on every simulated turn.
- Live preview testing covers room creation, guest joining, cross-tab synchronization, a successful transfer, a denial, the exact “Draw from the Veil.” history entry, and hidden-hand boundaries.
