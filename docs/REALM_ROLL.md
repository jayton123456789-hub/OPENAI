# Realm Roll — Rules and Production Specification

Realm Roll is MaskLife’s fantasy Skee-Ball game. Every control is tap-first and designed for a narrow phone screen.

## Match rules

- Each player rolls five balls in each of three rounds, alternating after every ball.
- The lane has seven targets worth 10, 20, 30, 40, 50, 100, and 100 points.
- The two 100-point Dragon Gates are physically smaller and demand more exact timing.
- A turn has three decisions: select a target, lock the moving power meter, and lock the moving accuracy meter.
- The resolved impact depends on the chosen target, locked power, locked accuracy, and a small deterministic curve.
- A near miss can fall into a neighboring ring; an impact outside every scoring ring earns zero.
- The highest total after all regulation balls wins.
- A regulation tie starts Sudden Roll. Tied leaders receive one ball each until exactly one leader remains.

## Modes

- Solo: one human against one or two AI rivals at Novice, Adept, or Royal difficulty.
- Pass and play: two to four humans on one device, protected by a handoff curtain.
- Private online: a host shares an invitation URL and each device receives a private reconnect token.

Online shots are resolved by the server. Clients submit only the target, power, and accuracy values; they never receive the game’s random state.

## AI

- Novice favors safer rings and has wider timing error.
- Adept balances 40/50-point targets with occasional Dragon Gate attempts.
- Royal considers score pressure, remaining balls, and Sudden Roll, becoming more aggressive when it needs a comeback.
- All AI uses the same scoring and physics rules as human players.

## Interface and accessibility

- No drag gesture is required anywhere in the match.
- The active target, current round, ball count, turn owner, meter state, impact, points, and next action remain visible or explicitly announced.
- Reduced motion shortens travel animation and automatically supplies accessible centered timing.
- Sound, haptics, and high contrast are independently configurable.
- The tutorial teaches the entire interaction loop before opening a practice match.
