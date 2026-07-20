import { ensureRoomsSchema, getRoomsDb } from "@/db/rooms";
import type { RealmRoomRow } from "@/db/schema";
import {
  createRealmGame,
  resolveRealmShot,
  upgradeRealmGameState,
  type RealmGameState,
} from "@/lib/realm-roll";
import {
  createRealmOnlineGameView,
  type RealmOnlineAction,
  type RealmRoomStatus,
  type RealmRoomView,
} from "@/lib/realm-online-room";

const ROOM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RealmRoomError extends Error {
  constructor(message: string, public readonly status: number) {
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

function parseState(row: RealmRoomRow) {
  if (!row.stateJson) return null;
  try {
    const state = upgradeRealmGameState(JSON.parse(row.stateJson));
    if (!state) throw new Error("Unreadable state");
    return state;
  } catch {
    throw new RealmRoomError("This atlas can no longer be read.", 500);
  }
}

async function findRoom(roomId: string) {
  await ensureRoomsSchema();
  const id = normalizeRoomId(roomId);
  if (id.length !== 6) throw new RealmRoomError("That room code is not valid.", 400);
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
      FROM realm_rooms WHERE id = ?`)
    .bind(id)
    .first<RealmRoomRow>();
  if (!row) throw new RealmRoomError("That table could not be found.", 404);
  if (row.expiresAt <= Date.now()) throw new RealmRoomError("That invitation has expired.", 410);
  return row;
}

async function identifySeat(row: RealmRoomRow, token: string): Promise<0 | 1> {
  if (!token) throw new RealmRoomError("This invitation is missing its private key.", 401);
  const hash = await tokenHash(token);
  if (safeEqual(hash, row.hostTokenHash)) return 0;
  if (safeEqual(hash, row.guestTokenHash)) return 1;
  throw new RealmRoomError("This invitation is not valid for that table.", 403);
}

function viewRoom(row: RealmRoomRow, seat: 0 | 1): RealmRoomView {
  const game = parseState(row);
  return {
    id: row.id,
    status: row.status as RealmRoomStatus,
    version: row.version,
    seat,
    hostName: row.hostName,
    guestName: row.guestName,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    game: game ? createRealmOnlineGameView(game) : null,
  };
}

export function realmBearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function isRealmAction(value: unknown): value is RealmOnlineAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  if (!Number.isInteger(action.version) || typeof action.type !== "string") return false;
  if (action.type === "rematch") return true;
  return action.type === "shoot"
    && typeof action.targetId === "string"
    && typeof action.power === "number"
    && Number.isFinite(action.power)
    && action.power >= 0
    && action.power <= 1
    && typeof action.accuracy === "number"
    && Number.isFinite(action.accuracy)
    && action.accuracy >= 0
    && action.accuracy <= 1;
}

export async function createRealmRoom(request: Request, requestedName: unknown) {
  await ensureRoomsSchema();
  const db = await getRoomsDb();
  const hostName = cleanName(requestedName, "Ruler One");
  const hostToken = randomToken();
  const guestToken = randomToken();
  const [hostTokenHash, guestTokenHash] = await Promise.all([tokenHash(hostToken), tokenHash(guestToken)]);
  const now = Date.now();
  let roomId = "";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = randomRoomId();
    const result = await db
      .prepare(`INSERT OR IGNORE INTO realm_rooms (
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
  if (!roomId) throw new RealmRoomError("The atlas could not open a new table. Try again.", 503);

  const row = await findRoom(roomId);
  const invite = new URL(request.url);
  invite.pathname = "/realm-roll";
  invite.search = "";
  invite.searchParams.set("realmRoom", roomId);
  invite.searchParams.set("realmKey", guestToken);
  return {
    room: viewRoom(row, 0),
    credentials: { roomId, token: hostToken, inviteUrl: invite.toString() },
  };
}

export async function joinRealmRoom(roomId: string, token: string, requestedName: unknown) {
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (seat !== 1) throw new RealmRoomError("Only the invited ruler can take this seat.", 403);
  if (row.status === "waiting") {
    const guestName = cleanName(requestedName, "Ruler Two");
    const game = createRealmGame(
      [
        { name: row.hostName, kind: "human" },
        { name: guestName, kind: "human" },
      ],
      { mode: "online", difficulty: "royal" },
    );
    const now = Date.now();
    const db = await getRoomsDb();
    const update = await db
      .prepare(`UPDATE realm_rooms
        SET guest_name = ?, status = 'active', state_json = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND status = 'waiting' AND version = ?`)
      .bind(guestName, JSON.stringify(game), now, row.id, row.version)
      .run();
    if ((update.meta.changes ?? 0) === 0) return getRealmRoom(roomId, token);
  }
  return getRealmRoom(roomId, token);
}

export async function getRealmRoom(roomId: string, token: string) {
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (seat === 1 && row.status === "waiting") {
    throw new RealmRoomError("Take your seat to open this atlas.", 409);
  }
  return viewRoom(row, seat);
}

function applyAction(current: RealmGameState, seat: 0 | 1, action: RealmOnlineAction) {
  if (action.type === "rematch") {
    if (current.status !== "complete") throw new RealmRoomError("The current atlas is not complete.", 409);
    return createRealmGame(
      current.players.map((player) => ({ name: player.name, kind: "human" as const })),
      { mode: "online", difficulty: "royal" },
    );
  }
  if (current.status !== "active") throw new RealmRoomError("This atlas is already complete.", 409);
  if (current.currentPlayer !== seat) throw new RealmRoomError("Wait for the other ruler's turn.", 409);
  const actorId = current.players[seat].id;
  return resolveRealmShot(current, {
    actorId,
    targetId: action.targetId,
    power: action.power,
    accuracy: action.accuracy,
  });
}

export async function applyRealmRoomAction(roomId: string, token: string, action: unknown) {
  if (!isRealmAction(action)) throw new RealmRoomError("That move is not valid.", 400);
  const row = await findRoom(roomId);
  const seat = await identifySeat(row, token);
  if (action.version !== row.version) throw new RealmRoomError("The table changed. Refreshing the latest turn.", 409);
  const current = parseState(row);
  if (!current) throw new RealmRoomError("The second ruler has not joined yet.", 409);
  const next = applyAction(current, seat, action);
  if (next === current) throw new RealmRoomError("That move is not legal right now.", 400);

  const now = Date.now();
  const status: RealmRoomStatus = next.status === "complete" ? "complete" : "active";
  const db = await getRoomsDb();
  const update = await db
    .prepare(`UPDATE realm_rooms
      SET status = ?, state_json = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?`)
    .bind(status, JSON.stringify(next), now, row.id, row.version)
    .run();
  if ((update.meta.changes ?? 0) === 0) {
    throw new RealmRoomError("The other ruler moved first. Refreshing the table.", 409);
  }
  return getRealmRoom(roomId, token);
}
