import type {
  RealmDifficulty,
  RealmEvent,
  RealmGameState,
  RealmPlayer,
  RealmShot,
} from "./realm-roll";

export type RealmRoomStatus = "waiting" | "active" | "complete";

export interface RealmOnlineGameView {
  version: 2;
  game: "realm-roll";
  id: string;
  createdAt: number;
  mode: "online";
  difficulty: RealmDifficulty;
  players: RealmPlayer[];
  currentPlayer: number;
  turn: number;
  round: number;
  status: "active" | "complete";
  winnerIds: string[];
  lastShot: RealmShot | null;
  suddenDeath: boolean;
  tiebreakerIds: string[];
  suddenDeathRound: number;
  suddenShotsThisRound: number;
  events: RealmEvent[];
  lastMessage: string;
}

export interface RealmRoomView {
  id: string;
  status: RealmRoomStatus;
  version: number;
  seat: 0 | 1;
  hostName: string;
  guestName: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  game: RealmOnlineGameView | null;
}

export interface RealmOnlineCredentials {
  roomId: string;
  token: string;
  inviteUrl?: string;
}

export type RealmOnlineAction =
  | { type: "shoot"; version: number; targetId: string; power: number; accuracy: number }
  | { type: "rematch"; version: number };

export function createRealmOnlineGameView(game: RealmGameState): RealmOnlineGameView {
  return {
    version: 2,
    game: "realm-roll",
    id: game.id,
    createdAt: game.createdAt,
    mode: "online",
    difficulty: game.difficulty,
    players: game.players.map((player) => ({
      ...player,
      shots: player.shots.map((shot) => ({ ...shot })),
    })),
    currentPlayer: game.currentPlayer,
    turn: game.turn,
    round: game.round,
    status: game.status,
    winnerIds: [...game.winnerIds],
    lastShot: game.lastShot ? { ...game.lastShot } : null,
    suddenDeath: game.suddenDeath,
    tiebreakerIds: [...game.tiebreakerIds],
    suddenDeathRound: game.suddenDeathRound,
    suddenShotsThisRound: game.suddenShotsThisRound,
    events: game.events.map((event) => ({ ...event })),
    lastMessage: game.lastMessage,
  };
}
