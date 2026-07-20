export const REALM_ROUNDS = 3;
export const BALLS_PER_ROUND = 5;
export const REGULATION_BALLS = REALM_ROUNDS * BALLS_PER_ROUND;

export type RealmDifficulty = "novice" | "adept" | "royal";
export type RealmMode = "solo" | "local" | "online";
export type RealmPlayerKind = "human" | "ai";

export interface RealmTarget {
  id: string;
  name: string;
  shortName: string;
  points: number;
  x: number;
  y: number;
  idealPower: number;
  radius: number;
  hue: string;
}

export interface RealmShot {
  id: string;
  playerId: string;
  targetId: string;
  power: number;
  accuracy: number;
  impactX: number;
  impactY: number;
  scoredTargetId: string | null;
  points: number;
  perfect: boolean;
  round: number;
  ball: number;
}

export interface RealmPlayer {
  id: string;
  name: string;
  kind: RealmPlayerKind;
  score: number;
  shotsTaken: number;
  shots: RealmShot[];
}

export interface RealmEvent {
  id: string;
  turn: number;
  actorId: string;
  kind: "shot" | "round" | "tiebreak" | "finish";
  text: string;
}

export interface RealmGameState {
  version: 2;
  game: "realm-roll";
  id: string;
  createdAt: number;
  mode: RealmMode;
  difficulty: RealmDifficulty;
  players: RealmPlayer[];
  currentPlayer: number;
  turn: number;
  round: number;
  status: "active" | "complete";
  winnerIds: string[];
  randomState: number;
  lastShot: RealmShot | null;
  suddenDeath: boolean;
  tiebreakerIds: string[];
  suddenDeathRound: number;
  suddenShotsThisRound: number;
  events: RealmEvent[];
  lastMessage: string;
}

export interface RealmPlayerSeed {
  name: string;
  kind: RealmPlayerKind;
}

export interface RealmShotAction {
  actorId: string;
  targetId: string;
  power: number;
  accuracy: number;
}

export const REALM_TARGETS: RealmTarget[] = [
  { id: "meadow", name: "Meadow Gate", shortName: "Meadow", points: 10, x: .5, y: .82, idealPower: .32, radius: .18, hue: "#78a36d" },
  { id: "river", name: "River Keep", shortName: "River", points: 20, x: .5, y: .68, idealPower: .44, radius: .15, hue: "#62a2ae" },
  { id: "ember", name: "Ember Tower", shortName: "Ember", points: 30, x: .5, y: .54, idealPower: .56, radius: .13, hue: "#c57a53" },
  { id: "moon", name: "Moon Court", shortName: "Moon", points: 40, x: .5, y: .40, idealPower: .67, radius: .11, hue: "#8d83bb" },
  { id: "crown", name: "Crown Ring", shortName: "Crown", points: 50, x: .5, y: .26, idealPower: .78, radius: .09, hue: "#d7b961" },
  { id: "dragon-left", name: "Dragon Gate", shortName: "Dragon", points: 100, x: .15, y: .15, idealPower: .9, radius: .068, hue: "#c75f52" },
  { id: "dragon-right", name: "Wyvern Gate", shortName: "Wyvern", points: 100, x: .85, y: .15, idealPower: .9, radius: .068, hue: "#c75f52" },
];

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function copyState(source: RealmGameState): RealmGameState {
  return {
    ...source,
    players: source.players.map((player) => ({
      ...player,
      shots: player.shots.map((shot) => ({ ...shot })),
    })),
    lastShot: source.lastShot ? { ...source.lastShot } : null,
    winnerIds: [...source.winnerIds],
    tiebreakerIds: [...source.tiebreakerIds],
    events: source.events.map((event) => ({ ...event })),
  };
}

function random(state: RealmGameState) {
  state.randomState = (Math.imul(state.randomState, 1664525) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addEvent(state: RealmGameState, event: Omit<RealmEvent, "id" | "turn">) {
  const next: RealmEvent = {
    ...event,
    id: `${state.turn}-${state.events.length}-${event.kind}`,
    turn: state.turn,
  };
  state.events = [next, ...state.events].slice(0, 50);
  state.lastMessage = next.text;
}

function currentRoundFor(player: RealmPlayer) {
  return Math.min(REALM_ROUNDS, Math.floor(player.shotsTaken / BALLS_PER_ROUND) + 1);
}

function currentBallFor(player: RealmPlayer) {
  return (player.shotsTaken % BALLS_PER_ROUND) + 1;
}

export function getRealmTarget(targetId: string) {
  return REALM_TARGETS.find((target) => target.id === targetId) ?? REALM_TARGETS[0];
}

export function getCurrentRealmRound(state: RealmGameState) {
  if (state.suddenDeath) return REALM_ROUNDS + state.suddenDeathRound;
  return currentRoundFor(state.players[state.currentPlayer]);
}

export function getCurrentRealmBall(state: RealmGameState) {
  if (state.suddenDeath) return 1;
  return currentBallFor(state.players[state.currentPlayer]);
}

export function remainingRealmBalls(player: RealmPlayer) {
  return Math.max(0, REGULATION_BALLS - player.shotsTaken);
}

export function createRealmGame(
  seeds: RealmPlayerSeed[],
  options: { mode: RealmMode; difficulty?: RealmDifficulty; seed?: number },
): RealmGameState {
  const createdAt = Date.now();
  const seed = (options.seed ?? createdAt) >>> 0;
  return {
    version: 2,
    game: "realm-roll",
    id: `realm-${createdAt}`,
    createdAt,
    mode: options.mode,
    difficulty: options.difficulty ?? "adept",
    players: seeds.slice(0, 4).map((player, index) => ({
      id: `roller-${index + 1}`,
      name: player.name.trim() || `Roller ${index + 1}`,
      kind: player.kind,
      score: 0,
      shotsTaken: 0,
      shots: [],
    })),
    currentPlayer: 0,
    turn: 1,
    round: 1,
    status: "active",
    winnerIds: [],
    randomState: seed || 1,
    lastShot: null,
    suddenDeath: false,
    tiebreakerIds: [],
    suddenDeathRound: 0,
    suddenShotsThisRound: 0,
    events: [],
    lastMessage: "The lane is open. Choose a realm, lock your power, and roll.",
  };
}

function scoreImpact(impactX: number, impactY: number) {
  const matches = REALM_TARGETS
    .map((target) => ({
      target,
      distance: Math.hypot((impactX - target.x) * 1.06, impactY - target.y) / target.radius,
    }))
    .filter((item) => item.distance <= 1)
    .sort((a, b) => a.distance - b.distance || b.target.points - a.target.points);
  return matches[0]?.target ?? null;
}

function finishGame(state: RealmGameState, winner: RealmPlayer) {
  state.status = "complete";
  state.winnerIds = [winner.id];
  addEvent(state, {
    actorId: winner.id,
    kind: "finish",
    text: `${winner.name} rules the lane with ${winner.score} points.`,
  });
}

function beginSuddenDeath(state: RealmGameState, tied: RealmPlayer[]) {
  state.suddenDeath = true;
  state.tiebreakerIds = tied.map((player) => player.id);
  state.suddenDeathRound = 1;
  state.suddenShotsThisRound = 0;
  state.currentPlayer = state.players.findIndex((player) => player.id === state.tiebreakerIds[0]);
  state.round = REALM_ROUNDS + 1;
  addEvent(state, {
    actorId: state.tiebreakerIds[0],
    kind: "tiebreak",
    text: "The scores are tied. Sudden Roll begins: one ball each until the crown is claimed.",
  });
}

function completeRegulationOrAdvance(state: RealmGameState) {
  const unfinished = state.players.some((player) => player.shotsTaken < REGULATION_BALLS);
  if (unfinished) {
    for (let step = 1; step <= state.players.length; step += 1) {
      const candidate = (state.currentPlayer + step) % state.players.length;
      if (state.players[candidate].shotsTaken < REGULATION_BALLS) {
        state.currentPlayer = candidate;
        state.turn += 1;
        state.round = currentRoundFor(state.players[candidate]);
        if (state.round > state.events.filter((event) => event.kind === "round").length + 1) {
          addEvent(state, {
            actorId: state.players[candidate].id,
            kind: "round",
            text: `Round ${state.round} begins. Five fresh balls remain in this frame.`,
          });
        }
        return;
      }
    }
  }

  const highScore = Math.max(...state.players.map((player) => player.score));
  const leaders = state.players.filter((player) => player.score === highScore);
  if (leaders.length === 1) finishGame(state, leaders[0]);
  else beginSuddenDeath(state, leaders);
}

function advanceSuddenDeath(state: RealmGameState) {
  state.suddenShotsThisRound += 1;
  const activeIds = state.tiebreakerIds;
  if (state.suddenShotsThisRound < activeIds.length) {
    const currentTieIndex = activeIds.indexOf(state.players[state.currentPlayer].id);
    const nextId = activeIds[(currentTieIndex + 1) % activeIds.length];
    state.currentPlayer = state.players.findIndex((player) => player.id === nextId);
    state.turn += 1;
    return;
  }

  const contenders = state.players.filter((player) => activeIds.includes(player.id));
  const highScore = Math.max(...contenders.map((player) => player.score));
  const leaders = contenders.filter((player) => player.score === highScore);
  if (leaders.length === 1) {
    finishGame(state, leaders[0]);
    return;
  }
  state.tiebreakerIds = leaders.map((player) => player.id);
  state.suddenDeathRound += 1;
  state.suddenShotsThisRound = 0;
  state.currentPlayer = state.players.findIndex((player) => player.id === state.tiebreakerIds[0]);
  state.turn += 1;
  state.round = REALM_ROUNDS + state.suddenDeathRound;
  addEvent(state, {
    actorId: state.tiebreakerIds[0],
    kind: "tiebreak",
    text: `Sudden Roll ${state.suddenDeathRound} begins. The remaining rulers roll again.`,
  });
}

export function resolveRealmShot(source: RealmGameState, action: RealmShotAction) {
  if (source.status !== "active") return source;
  const actor = source.players[source.currentPlayer];
  if (!actor || actor.id !== action.actorId) return source;
  const selected = REALM_TARGETS.find((target) => target.id === action.targetId);
  if (!selected) return source;
  if (!source.suddenDeath && actor.shotsTaken >= REGULATION_BALLS) return source;

  const state = copyState(source);
  const player = state.players[state.currentPlayer];
  const power = clamp(action.power);
  const accuracy = clamp(action.accuracy);
  const curveX = (random(state) - .5) * .018;
  const curveY = (random(state) - .5) * .014;
  const impactX = clamp(selected.x + (accuracy - .5) * .68 + curveX, -.05, 1.05);
  const impactY = clamp(selected.y - (power - selected.idealPower) * .9 + curveY, -.05, 1.08);
  const scored = scoreImpact(impactX, impactY);
  const perfect = scored?.id === selected.id
    && Math.abs(power - selected.idealPower) <= .028
    && Math.abs(accuracy - .5) <= .028;
  const shot: RealmShot = {
    id: `${state.id}-${state.turn}-${player.shotsTaken + 1}`,
    playerId: player.id,
    targetId: selected.id,
    power,
    accuracy,
    impactX,
    impactY,
    scoredTargetId: scored?.id ?? null,
    points: scored?.points ?? 0,
    perfect,
    round: state.suddenDeath ? REALM_ROUNDS + state.suddenDeathRound : currentRoundFor(player),
    ball: state.suddenDeath ? 1 : currentBallFor(player),
  };
  player.score += shot.points;
  player.shotsTaken += 1;
  player.shots.push(shot);
  state.lastShot = shot;
  addEvent(state, {
    actorId: player.id,
    kind: "shot",
    text: shot.points
      ? `${player.name} rolls into ${scored?.name} for ${shot.points} points${perfect ? " — a perfect shot." : "."}`
      : `${player.name}'s ball circles the realm and scores 0.`,
  });

  if (state.suddenDeath) advanceSuddenDeath(state);
  else completeRegulationOrAdvance(state);
  return state;
}

function scorePressure(state: RealmGameState, actor: RealmPlayer) {
  const leader = Math.max(...state.players.filter((player) => player.id !== actor.id).map((player) => player.score), 0);
  const ballsLeft = Math.max(1, remainingRealmBalls(actor));
  return Math.max(0, leader - actor.score) / ballsLeft;
}

export function chooseRealmAIShot(state: RealmGameState): RealmShotAction | null {
  const actor = state.players[state.currentPlayer];
  if (!actor || actor.kind !== "ai" || state.status !== "active") return null;
  const rand = seededRandom(state.createdAt + state.turn * 977 + actor.shotsTaken * 131);
  const pressure = scorePressure(state, actor);
  const difficulty = state.difficulty;
  let target: RealmTarget;

  if (difficulty === "novice") {
    const choices = REALM_TARGETS.filter((item) => item.points <= (pressure >= 35 ? 50 : 30));
    target = choices[Math.floor(rand() * choices.length)] ?? REALM_TARGETS[1];
  } else if (difficulty === "adept") {
    if (pressure >= 45 || state.suddenDeath) target = rand() < .32 ? REALM_TARGETS[5 + Math.floor(rand() * 2)] : REALM_TARGETS[4];
    else target = rand() < .55 ? REALM_TARGETS[3] : REALM_TARGETS[4];
  } else {
    if (pressure >= 35 || state.suddenDeath) target = rand() < .55 ? REALM_TARGETS[5 + Math.floor(rand() * 2)] : REALM_TARGETS[4];
    else target = rand() < .22 ? REALM_TARGETS[5 + Math.floor(rand() * 2)] : REALM_TARGETS[4];
  }

  const spread = difficulty === "novice" ? .19 : difficulty === "adept" ? .095 : .048;
  const powerError = (rand() + rand() - 1) * spread;
  const accuracyError = (rand() + rand() - 1) * spread;
  return {
    actorId: actor.id,
    targetId: target.id,
    power: clamp(target.idealPower + powerError),
    accuracy: clamp(.5 + accuracyError),
  };
}

export function upgradeRealmGameState(value: unknown): RealmGameState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<RealmGameState>;
  if (source.game !== "realm-roll" || source.version !== 2 || !Array.isArray(source.players)) return null;
  if (!Number.isInteger(source.currentPlayer) || !Number.isInteger(source.turn)) return null;
  return {
    ...(source as RealmGameState),
    players: source.players.map((player) => ({
      ...player,
      score: Number.isFinite(player.score) ? player.score : 0,
      shotsTaken: Number.isInteger(player.shotsTaken) ? player.shotsTaken : 0,
      shots: Array.isArray(player.shots) ? player.shots.map((shot) => ({ ...shot })) : [],
    })),
    winnerIds: Array.isArray(source.winnerIds) ? [...source.winnerIds] : [],
    tiebreakerIds: Array.isArray(source.tiebreakerIds) ? [...source.tiebreakerIds] : [],
    events: Array.isArray(source.events) ? source.events.map((event) => ({ ...event })) : [],
    lastShot: source.lastShot ? { ...source.lastShot } : null,
    randomState: Number.isInteger(source.randomState) ? source.randomState! : 1,
  };
}
