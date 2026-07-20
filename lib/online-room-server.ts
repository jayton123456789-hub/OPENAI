import { ensureRoomsSchema, getRoomsDb } from "@/db/rooms";
import type { OnlineRoomRow } from "@/db/schema";
import { createGame, resolveBank, resolveInquiry, upgradeGameState, type GameState } from "@/lib/veilbound";
import {
  createOnlineGameView,
  type OnlineAction,
  type OnlineRoomStatus,
  type OnlineRoomView,
} from "@/lib/online-room";

const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class OnlineRoomError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

function normalizeRoomId(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function cleanName(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 18);
  return cleaned || fallback;
}

function randomRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const binary = Array.from(bytes, (value) => String.fromCharCode(value)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function parseState(row: OnlineRoomRow) {
  if (!row.stateJson) return null;
  try {
    const state = upgradeGameState(JSON.parse(row.stateJson));
    if (!state) throw new Error("Unreadable state");
    return state;
  } catch {
    throw new OnlineRoomError("This circle can no longer be read.", 500);
  }
}

async function findRoom(roomId: string) {
  await ensureRoomsSchema();
  const id = normalizeRoomId(roomId);
  if (id.length !== 6) throw new OnlineRoomError("That room code is not valid.", 400);
  const db = await getRoomsDb();
  const row = await db
    .prepare(`SELECT
      id,
      host_name AS hostName,
      guest_name AS guestName,
      host_token_hash AS hostTokenHash,
      guest_token_hash AS guestTokenHash,
      status,
      state_json AS stateJson,
      version,
      created_at AS createdAt,
      updated_at AS updatedAt,
      expires_at AS expiresAt
      FROM online_rooms WHERE id = ?`)
    .bind(id)
    .first<OnlineRoomRow>();
  if (!row) throw new OnlineRoomError("That circle could not be found.", 404);
  if (row.expiresAt <= Date.now()) throw new OnlineRoomError("That invitation has expired.", 410);
  return row;
}

async function identifySeat(row: OnlineRoomRow, token: string): Promise<0 | 1> {
  if (!token) throw new OnlineRoomError("This invitation is missing its private key.", 401);
  const hash = await tokenHash(token);
  if (safeEqual(hash, row.hostTokenHash)) return 0;
  if (safeEqual(hash, row.guestTokenHash)) return 1;
  throw new OnlineRoomError("This invitation is not valid for that circle.", 403);
}

function viewRoom(row: OnlineRoomRow, seat: 0 | 1): OnlineRoomView {
  const game = parseState(row);
  return {
    id: row.id,
    status: row.status as OnlineRoomStatus,
    version: row.version,
    seat,
    hostName: row.hostName,
    guestName: row.guestName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    game: game ? createOnlineGameView(game, seat) : null,
  };
}

export function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function isOnlineAction(value: unknown): value is OnlineAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  if (!Number.isInteger(action.version)) return false;
  if (action.type === "rematch") return true;
  if (action.type === "bank") {
    return Array.isArray(action.cardIds)
      && action.cardIds.length >= 2
      && action.cardIds.length <= 4
      && action.cardIds.every((cardId) => typeof cardId === "string");
  }
  return action.type === "inquire"
    && typeof action.targetId === "string"
    && typeof action.identityId === "string";
}

export async function createOnlineRoom(request: Request, requestedName: unknown) {
  await ensureRoomsSchema();
  const db = await getRoomsDb();
  const hostName = cleanName(requestedName, "Seeker One");
  const hostToken = randomToken();
  const guestToken = randomToken();
  const [hostTokenHash, guestTokenHash] = await Promise.all([
    tokenHash(hostToken),
    tokenHash(guestToken),
  ]);
  const now = Date.now();
  let roomId = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomRoomId();
    const result = await db
      .prepare(`INSERT OR IGNORE INTO online_rooms (
        id, host_name, guest_name, host_token_hash, guest_token_hash, status,
        state_json, version, created_at, updated_at, expires_at
      ) VALUES (?, ?, NULL, ?, ?, 'waiting', NULL, 0, ?, ?, ?)`)
      .bind(candidate, hostName, hostTokenHash, guestTokenHash, now, now, now + ROOM_TTL_MS)
      .run();
    if ((result.meta.changes ?? 0) > 0) {
      roomId = candidate;
      break;
    }
  }
  if (!roomId) throw new OnlineRoomError("The Veil could not open a new circle. Try again.", 503);

  const row = await findRoom(roomId);
  const invite = new URL(request.url);
  invite.pathname = "/";
  invite.search = "";
  invite.searchParams.set("room", roomId);
  invite.searchParams.set("key", guestToken);

  return {
    room: viewRoom(row, 0),
    credentials: { roomId, token: hostToken, inviteUrl: invite.toString() },
  };
}

export async function joinOnlineRoom(roomId: string, token: string, requestedName: unknown) {
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (seat !== 1) throw new OnlineRoomError("Only the invited seeker can take this seat.", 403);

  if (row.status === "waiting") {
    const guestName = cleanName(requestedName, "Seeker Two");
    const game = createGame(
      [
        { name: row.hostName, kind: "human" },
        { name: guestName, kind: "human" },
      ],
      { mode: "online", difficulty: "seer" },
    );
    const now = Date.now();
    const db = await getRoomsDb();
    const update = await db
      .prepare(`UPDATE online_rooms
        SET guest_name = ?, status = 'active', state_json = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'waiting' AND version = ?`)
      .bind(guestName, JSON.stringify(game), now, row.id, row.version)
      .run();
    if ((update.meta.changes ?? 0) === 0) {
      return getOnlineRoom(roomId, token);
    }
  }
  return getOnlineRoom(roomId, token);
}

export async function getOnlineRoom(roomId: string, token: string) {
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (seat === 1 && row.status === "waiting") {
    throw new OnlineRoomError("Take your seat to enter this circle.", 409);
  }
  return viewRoom(row, seat);
}

export async function applyOnlineAction(roomId: string, token: string, action: unknown) {
  if (!isOnlineAction(action)) throw new OnlineRoomError("That action is not valid.", 400);
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (!Number.isInteger(action.version) || action.version !== row.version) {
    throw new OnlineRoomError("The circle changed. Refreshing the latest turn.", 409);
  }
  const current = parseState(row);
  if (!current) throw new OnlineRoomError("The second seeker has not joined yet.", 409);

  let next: GameState;
  if (action.type === "rematch") {
    if (current.status !== "complete") throw new OnlineRoomError("The current rite is not complete.", 409);
    next = createGame(
      current.players.map((player) => ({ name: player.name, kind: "human" as const })),
      { mode: "online", difficulty: "seer" },
    );
  } else if (action.type === "inquire") {
    if (current.status !== "active") throw new OnlineRoomError("This rite has already ended.", 409);
    if (current.currentPlayer !== seat) throw new OnlineRoomError("Wait for the other seeker’s turn.", 409);
    next = resolveInquiry(current, {
      actorId: current.players[seat].id,
      targetId: action.targetId,
      identityId: action.identityId,
    });
    if (next === current) throw new OnlineRoomError("That inquiry is not legal.", 400);
  } else {
    if (current.status !== "active") throw new OnlineRoomError("This rite has already ended.", 409);
    if (current.currentPlayer !== seat) throw new OnlineRoomError("Wait for the other seeker’s turn.", 409);
    next = resolveBank(current, {
      actorId: current.players[seat].id,
      cardIds: action.cardIds,
    });
    if (next === current) throw new OnlineRoomError("Those cards cannot be locked together.", 400);
  }

  const now = Date.now();
  const status: OnlineRoomStatus = next.status === "complete" ? "complete" : "active";
  const db = await getRoomsDb();
  const update = await db
    .prepare(`UPDATE online_rooms
      SET status = ?, state_json = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?`)
    .bind(status, JSON.stringify(next), now, row.id, row.version)
    .run();
  if ((update.meta.changes ?? 0) === 0) {
    throw new OnlineRoomError("The other seeker moved first. Refreshing the circle.", 409);
  }
  return getOnlineRoom(roomId, token);
}
