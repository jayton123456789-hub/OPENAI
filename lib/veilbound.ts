export const IDENTITIES = [
  { id: "warden", name: "The Warden", epithet: "Keeper of thresholds", sigil: "W", hue: "#718060" },
  { id: "whisper", name: "The Whisper", epithet: "Voice behind the curtain", sigil: "Wh", hue: "#75677f" },
  { id: "oracle", name: "The Oracle", epithet: "Witness to what may be", sigil: "O", hue: "#9b8457" },
  { id: "silent", name: "The Silent", epithet: "Guardian of unspoken vows", sigil: "S", hue: "#4f6556" },
  { id: "lantern", name: "The Lantern", epithet: "Light in the hidden path", sigil: "L", hue: "#b08c4d" },
  { id: "moth", name: "The Moth", epithet: "Seeker of forbidden light", sigil: "M", hue: "#7b7568" },
  { id: "thorn", name: "The Thorn", epithet: "Protector of tender things", sigil: "T", hue: "#6c7650" },
  { id: "mirror", name: "The Mirror", epithet: "Bearer of borrowed faces", sigil: "Mi", hue: "#81908a" },
  { id: "heir", name: "The Heir", epithet: "Promise of a forgotten house", sigil: "H", hue: "#9c735b" },
  { id: "raven", name: "The Raven", epithet: "Collector of final words", sigil: "R", hue: "#4a5055" },
  { id: "weaver", name: "The Weaver", epithet: "Binder of scattered fates", sigil: "We", hue: "#866f66" },
  { id: "pilgrim", name: "The Pilgrim", epithet: "Walker between names", sigil: "P", hue: "#6f806e" },
  { id: "crown", name: "The Empty Crown", epithet: "A throne awaiting truth", sigil: "C", hue: "#a38953" },
] as const;

export const ECHOES = ["Memory", "Desire", "Fear", "Truth"] as const;

export const WIN_SCORE = 7;

export type IdentityId = (typeof IDENTITIES)[number]["id"];
export type EchoName = (typeof ECHOES)[number];
export type Difficulty = "novice" | "adept" | "seer";
export type GameMode = "solo" | "local" | "online";
export type PlayerKind = "human" | "ai";

export interface VeilCard {
  id: string;
  identityId: IdentityId;
  echo: EchoName;
}

export interface BankedBound {
  id: string;
  identityId: IdentityId;
  cards: VeilCard[];
  points: number;
}

export interface PlayerState {
  id: string;
  name: string;
  kind: PlayerKind;
  hand: VeilCard[];
  bound: BankedBound[];
}

export interface GameEvent {
  id: string;
  turn: number;
  actorId: string;
  targetId?: string;
  identityId?: IdentityId;
  success?: boolean;
  text: string;
}

export interface GameState {
  version: 2;
  id: string;
  createdAt: number;
  mode: GameMode;
  difficulty: Difficulty;
  players: PlayerState[];
  deck: VeilCard[];
  deckCycle: number;
  veilDraws: number;
  currentPlayer: number;
  turn: number;
  status: "active" | "complete";
  events: GameEvent[];
  lastMessage: string;
  winnerIds: string[];
}

export interface PlayerSeed {
  name: string;
  kind: PlayerKind;
}

export interface InquiryChoice {
  actorId: string;
  targetId: string;
  identityId: IdentityId;
}

export interface BankChoice {
  actorId: string;
  cardIds: string[];
}

function rng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number) {
  const random = rng(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function copyState(state: GameState): GameState {
  return {
    ...state,
    deck: [...state.deck],
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      bound: player.bound.map((entry) => ({ ...entry, cards: [...entry.cards] })),
    })),
    events: [...state.events],
    winnerIds: [...state.winnerIds],
  };
}

function addEvent(
  state: GameState,
  event: Omit<GameEvent, "id" | "turn">,
) {
  const item: GameEvent = {
    ...event,
    id: `${state.turn}-${state.events.length}-${Date.now()}`,
    turn: state.turn,
  };
  state.events = [item, ...state.events].slice(0, 30);
  state.lastMessage = item.text;
}

function present(name: string, direct: string, thirdPerson: string) {
  return name.toLowerCase() === "you" ? direct : thirdPerson;
}

export function boundValueForCardCount(count: number) {
  return count >= 2 && count <= 4 ? count - 1 : 0;
}

export function scorePlayer(player: Pick<PlayerState, "bound">) {
  return player.bound.reduce((total, entry) => total + entry.points, 0);
}

export function bankableGroups(player: Pick<PlayerState, "hand">) {
  const groups = new Map<IdentityId, VeilCard[]>();
  player.hand.forEach((card) => {
    groups.set(card.identityId, [...(groups.get(card.identityId) ?? []), card]);
  });
  return [...groups.entries()]
    .filter(([, cards]) => cards.length >= 2)
    .map(([identityId, cards]) => ({ identityId, cards }));
}

function drawForEmptyHand(state: GameState, playerIndex: number) {
  const player = state.players[playerIndex];
  if (player.hand.length === 0) {
    const card = drawFromVeil(state);
    if (card) player.hand.push(card);
  }
}

function drawFromVeil(state: GameState) {
  if (state.deck.length === 0) {
    const cycle = state.deckCycle;
    state.deck = shuffle(buildDeck(cycle), state.createdAt + cycle * 7919);
    state.deckCycle += 1;
  }
  const card = state.deck.pop();
  if (card) state.veilDraws += 1;
  return card;
}

function finishIfComplete(state: GameState) {
  const highScore = Math.max(...state.players.map(scorePlayer));
  const targetReached = highScore >= WIN_SCORE;
  if (!targetReached) return false;

  state.status = "complete";
  state.winnerIds = state.players
    .filter((player) => scorePlayer(player) === highScore)
    .map((player) => player.id);
  const winners = state.players
    .filter((player) => state.winnerIds.includes(player.id))
    .map((player) => player.name)
    .join(" & ");
  addEvent(state, {
    actorId: state.winnerIds[0] ?? "veil",
    success: true,
    text: `${winners} ${state.winnerIds.length > 1 ? "reach" : present(winners, "reach", "reaches")} seven Bounds and ${state.winnerIds.length > 1 ? "share" : present(winners, "claim", "claims")} the final revelation.`,
  });
  return true;
}

function advanceTurn(state: GameState) {
  if (finishIfComplete(state)) return;
  for (let step = 1; step <= state.players.length; step += 1) {
    const candidate = (state.currentPlayer + step) % state.players.length;
    drawForEmptyHand(state, candidate);
    if (state.players[candidate].hand.length > 0) {
      state.currentPlayer = candidate;
      state.turn += 1;
      return;
    }
  }
  finishIfComplete(state);
}

export function getIdentity(identityId: IdentityId) {
  return IDENTITIES.find((identity) => identity.id === identityId) ?? IDENTITIES[0];
}

export function buildDeck(cycle = 0): VeilCard[] {
  return IDENTITIES.flatMap((identity) =>
    ECHOES.map((echo) => ({
      id: `${identity.id}-${echo.toLowerCase()}${cycle > 0 ? `-veil-${cycle}` : ""}`,
      identityId: identity.id,
      echo,
    })),
  );
}

export function createGame(
  playerSeeds: PlayerSeed[],
  options: {
    mode: GameMode;
    difficulty?: Difficulty;
    seed?: number;
  },
): GameState {
  const createdAt = Date.now();
  const players = playerSeeds.map((player, index): PlayerState => ({
    id: `player-${index + 1}`,
    name: player.name.trim() || `Seeker ${index + 1}`,
    kind: player.kind,
    hand: [],
    bound: [],
  }));
  const deck = shuffle(buildDeck(), options.seed ?? createdAt);
  const handSize = players.length === 2 ? 7 : 5;

  for (let cardIndex = 0; cardIndex < handSize; cardIndex += 1) {
    players.forEach((player) => {
      const card = deck.pop();
      if (card) player.hand.push(card);
    });
  }

  const state: GameState = {
    version: 2,
    id: `veil-${createdAt}`,
    createdAt,
    mode: options.mode,
    difficulty: options.difficulty ?? "adept",
    players,
    deck,
    deckCycle: 1,
    veilDraws: 0,
    currentPlayer: 0,
    turn: 1,
    status: "active",
    events: [],
    lastMessage: "The endless Veil stirs. Ask for an identity or lock a set into your Bank.",
    winnerIds: [],
  };

  players.forEach((_, index) => drawForEmptyHand(state, index));
  return state;
}

export function validInquiryIdentities(state: GameState, actorId: string) {
  const player = state.players.find((item) => item.id === actorId);
  if (!player) return [];
  return [...new Set(player.hand.map((card) => card.identityId))];
}

export function resolveInquiry(
  source: GameState,
  choice: InquiryChoice,
): GameState {
  if (source.status !== "active") return source;
  const state = copyState(source);
  const actorIndex = state.players.findIndex((player) => player.id === choice.actorId);
  const targetIndex = state.players.findIndex((player) => player.id === choice.targetId);
  if (actorIndex !== state.currentPlayer || targetIndex < 0 || targetIndex === actorIndex) {
    return source;
  }

  const actor = state.players[actorIndex];
  const target = state.players[targetIndex];
  if (!actor.hand.some((card) => card.identityId === choice.identityId)) return source;

  const identity = getIdentity(choice.identityId);
  const offered = target.hand.filter((card) => card.identityId === choice.identityId);

  addEvent(state, {
    actorId: actor.id,
    targetId: target.id,
    identityId: choice.identityId,
    text: `${actor.name} ${present(actor.name, "ask", "asks")} ${target.name}, “Do you hold ${identity.name}?”`,
  });

  if (offered.length > 0) {
    target.hand = target.hand.filter((card) => card.identityId !== choice.identityId);
    actor.hand.push(...offered);
    addEvent(state, {
      actorId: target.id,
      targetId: actor.id,
      identityId: choice.identityId,
      success: true,
      text: `${target.name} reveals ${offered.length} ${offered.length === 1 ? "echo" : "echoes"}. ${actor.name} ${present(actor.name, "inquire", "inquires")} again.`,
    });
    drawForEmptyHand(state, actorIndex);
    drawForEmptyHand(state, targetIndex);
    finishIfComplete(state);
    return state;
  }

  addEvent(state, {
    actorId: target.id,
    targetId: actor.id,
    identityId: choice.identityId,
    success: false,
    text: `${target.name}: “Draw from the Veil.”`,
  });

  const drawn = drawFromVeil(state);
  if (drawn) actor.hand.push(drawn);
  const luckyDraw = drawn?.identityId === choice.identityId;

  if (luckyDraw) {
    addEvent(state, {
      actorId: actor.id,
      identityId: choice.identityId,
      success: true,
      text: `The Veil answers with ${identity.name}. ${actor.name} ${present(actor.name, "inquire", "inquires")} again.`,
    });
    drawForEmptyHand(state, actorIndex);
    finishIfComplete(state);
    return state;
  }

  if (drawn) {
    addEvent(state, {
      actorId: actor.id,
      identityId: drawn.identityId,
      success: false,
      text: `${actor.name} ${present(actor.name, "draw", "draws")} an unseen echo.`,
    });
  } else {
    addEvent(state, {
      actorId: actor.id,
      success: false,
      text: "The Veil turns, but no Echo answers.",
    });
  }

  advanceTurn(state);
  return state;
}

export function resolveBank(source: GameState, choice: BankChoice): GameState {
  if (source.status !== "active") return source;
  const state = copyState(source);
  const actorIndex = state.players.findIndex((player) => player.id === choice.actorId);
  if (actorIndex !== state.currentPlayer) return source;

  const actor = state.players[actorIndex];
  const uniqueIds = [...new Set(choice.cardIds)];
  if (uniqueIds.length < 2 || uniqueIds.length > 4) return source;
  const cards = uniqueIds
    .map((cardId) => actor.hand.find((card) => card.id === cardId))
    .filter((card): card is VeilCard => Boolean(card));
  if (cards.length !== uniqueIds.length) return source;
  const identityId = cards[0].identityId;
  if (!cards.every((card) => card.identityId === identityId)) return source;

  const points = boundValueForCardCount(cards.length);
  if (!points) return source;
  const identity = getIdentity(identityId);
  const selected = new Set(uniqueIds);
  actor.hand = actor.hand.filter((card) => !selected.has(card.id));
  actor.bound.push({
    id: `${actor.id}-${identityId}-${state.turn}-${actor.bound.length + 1}`,
    identityId,
    cards,
    points,
  });
  addEvent(state, {
    actorId: actor.id,
    identityId,
    success: true,
    text: `${actor.name} ${present(actor.name, "lock", "locks")} ${cards.length} Echoes of ${identity.name} into the Bank for ${points} ${points === 1 ? "Bound" : "Bounds"}.`,
  });

  if (finishIfComplete(state)) return state;
  drawForEmptyHand(state, actorIndex);
  finishIfComplete(state);
  return state;
}

function choose<T>(items: T[], random: () => number) {
  return items[Math.floor(random() * items.length)];
}

export function chooseAIBank(state: GameState): BankChoice | null {
  const actor = state.players[state.currentPlayer];
  if (!actor || actor.kind !== "ai" || state.status !== "active") return null;
  const groups = bankableGroups(actor)
    .map((group) => ({
      ...group,
      points: boundValueForCardCount(group.cards.length),
    }))
    .sort((a, b) => b.cards.length - a.cards.length);
  if (!groups.length) return null;

  const currentScore = scorePlayer(actor);
  const leadingRival = Math.max(
    0,
    ...state.players.filter((player) => player.id !== actor.id).map(scorePlayer),
  );
  const winning = groups.find((group) => currentScore + group.points >= WIN_SCORE);
  if (winning) return { actorId: actor.id, cardIds: winning.cards.map((card) => card.id) };

  const complete = groups.find((group) => group.cards.length === 4);
  if (complete) return { actorId: actor.id, cardIds: complete.cards.map((card) => card.id) };

  let candidate: (typeof groups)[number] | undefined;
  if (state.difficulty === "novice") {
    candidate = groups[0];
  } else if (state.difficulty === "adept") {
    candidate = groups.find((group) => group.cards.length >= 3)
      ?? (state.deck.length <= 16 || actor.hand.length >= 10 ? groups[0] : undefined);
  } else {
    candidate = groups.find((group) =>
      group.cards.length >= 3
      && (state.deck.length <= 26 || currentScore >= 3 || leadingRival >= 5),
    ) ?? (state.deck.length <= 8 || actor.hand.length >= 12 || leadingRival >= 6 ? groups[0] : undefined);
  }
  return candidate
    ? { actorId: actor.id, cardIds: candidate.cards.map((card) => card.id) }
    : null;
}

function publicHoldingConfidence(
  state: GameState,
  playerId: string,
  identityId: IdentityId,
) {
  let confidence = 0;
  for (const event of [...state.events].reverse()) {
    if (event.identityId !== identityId) continue;
    const text = event.text.toLowerCase();

    // Asking publicly proves the seeker held at least one matching echo then.
    if (event.actorId === playerId && text.includes("do you hold")) confidence = 3;
    // A reveal transfers every matching echo to the requester.
    if (event.targetId === playerId && event.success === true && text.includes("reveal")) {
      confidence = Math.max(confidence, 8);
    }
    // A denial publicly proves that the answering seeker had none at that moment.
    if (event.actorId === playerId && event.success === false && text.includes("draw from the veil")) {
      confidence = -12;
    }
    if (event.actorId === playerId && text.includes("veil answers")) confidence = 8;
    // Banking moves known cards out of a hand, without proving no matching Echo remains.
    if (event.actorId === playerId && text.includes("into the bank")) confidence = Math.min(confidence, -2);
  }
  return confidence;
}

export function chooseAIInquiry(state: GameState): InquiryChoice | null {
  const actor = state.players[state.currentPlayer];
  if (!actor || actor.kind !== "ai" || actor.hand.length === 0) return null;
  const random = rng(state.createdAt + state.turn * 137 + actor.hand.length * 29);
  const identities = validInquiryIdentities(state, actor.id);
  const targets = state.players.filter(
    (player) => player.id !== actor.id && player.hand.length > 0,
  );
  if (identities.length === 0 || targets.length === 0) return null;

  if (state.difficulty === "novice") {
    return {
      actorId: actor.id,
      targetId: choose(targets, random).id,
      identityId: choose(identities, random),
    };
  }

  const candidates = targets.flatMap((target) =>
    identities.map((identityId) => {
      const ownCount = actor.hand.filter((card) => card.identityId === identityId).length;
      const memory = publicHoldingConfidence(state, target.id, identityId);
      const completionPressure = ownCount === 3 ? 9 : ownCount === 2 ? 4 : 0;
      const targetReach = Math.min(target.hand.length, 7) * 0.12;
      const memoryWeight = state.difficulty === "seer" ? 2.2 : 1.2;
      return {
        target,
        identityId,
        score:
          ownCount * (state.difficulty === "seer" ? 4 : 2.8) +
          completionPressure +
          memory * memoryWeight +
          targetReach +
          random(),
      };
    }),
  );
  const strongest = candidates.sort((a, b) => b.score - a.score)[0];
  if (!strongest) return null;
  return {
    actorId: actor.id,
    targetId: strongest.target.id,
    identityId: strongest.identityId,
  };
}

export function sortHand(cards: VeilCard[]) {
  const identityIndex = new Map(IDENTITIES.map((identity, index) => [identity.id, index]));
  return [...cards].sort((a, b) => {
    const byIdentity =
      (identityIndex.get(a.identityId) ?? 0) - (identityIndex.get(b.identityId) ?? 0);
    if (byIdentity !== 0) return byIdentity;
    return ECHOES.indexOf(a.echo) - ECHOES.indexOf(b.echo);
  });
}

export function upgradeGameState(value: unknown): GameState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as GameState & {
    version?: number;
    players?: Array<Omit<PlayerState, "bound"> & { bound?: Array<BankedBound | IdentityId> }>;
  };
  if (!Array.isArray(source.players) || !Array.isArray(source.deck)) return null;

  const players = source.players.map((player) => ({
    ...player,
    hand: Array.isArray(player.hand) ? [...player.hand] : [],
    bound: (Array.isArray(player.bound) ? player.bound : []).map((entry, index): BankedBound => {
      if (typeof entry !== "string") {
        return {
          ...entry,
          cards: Array.isArray(entry.cards) ? [...entry.cards] : [],
          points: boundValueForCardCount(entry.cards?.length ?? 0) || entry.points || 1,
        };
      }
      return {
        id: `${player.id}-${entry}-legacy-${index + 1}`,
        identityId: entry,
        cards: ECHOES.map((echo) => ({
          id: `${entry}-${echo.toLowerCase()}`,
          identityId: entry,
          echo,
        })),
        points: 3,
      };
    }),
  }));

  const state: GameState = {
    ...source,
    version: 2,
    players,
    deck: [...source.deck],
    deckCycle: Number.isInteger(source.deckCycle) ? source.deckCycle : 1,
    veilDraws: Number.isInteger(source.veilDraws) ? source.veilDraws : 0,
    events: Array.isArray(source.events) ? [...source.events] : [],
    winnerIds: Array.isArray(source.winnerIds) ? [...source.winnerIds] : [],
  };
  if (state.status === "active") finishIfComplete(state);
  return state;
}
