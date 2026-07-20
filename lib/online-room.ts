import type { BankedBound, GameEvent, GameState, IdentityId, VeilCard } from "./veilbound";

export type OnlineRoomStatus = "waiting" | "active" | "complete";

export interface OnlinePlayerView {
  id: string;
  name: string;
  handCount: number;
  bound: BankedBound[];
}

export interface OnlineGameView {
  id: string;
  createdAt: number;
  players: OnlinePlayerView[];
  yourHand: VeilCard[];
  deckCount: number;
  veilDraws: number;
  currentPlayer: number;
  turn: number;
  status: "active" | "complete";
  events: GameEvent[];
  lastMessage: string;
  winnerIds: string[];
}

export interface OnlineRoomView {
  id: string;
  status: OnlineRoomStatus;
  version: number;
  seat: 0 | 1;
  hostName: string;
  guestName: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  game: OnlineGameView | null;
}

export interface OnlineCredentials {
  roomId: string;
  token: string;
  inviteUrl?: string;
}

export interface OnlineInquiryAction {
  type: "inquire";
  version: number;
  targetId: string;
  identityId: IdentityId;
}

export interface OnlineRematchAction {
  type: "rematch";
  version: number;
}

export interface OnlineBankAction {
  type: "bank";
  version: number;
  cardIds: string[];
}

export type OnlineAction = OnlineInquiryAction | OnlineBankAction | OnlineRematchAction;

export function createOnlineGameView(game: GameState, seat: 0 | 1): OnlineGameView {
  return {
    id: game.id,
    createdAt: game.createdAt,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      bound: player.bound.map((entry) => ({ ...entry, cards: [...entry.cards] })),
    })),
    yourHand: [...(game.players[seat]?.hand ?? [])],
    deckCount: game.deck.length,
    veilDraws: game.veilDraws,
    currentPlayer: game.currentPlayer,
    turn: game.turn,
    status: game.status,
    events: [...game.events],
    lastMessage: game.lastMessage,
    winnerIds: [...game.winnerIds],
  };
}
