let initialization: Promise<void> | null = null;

export async function getRoomsDb(): Promise<D1Database> {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error("Veilbound online rooms require the Cloudflare D1 binding `DB`.");
  }
  return env.DB;
}

export function ensureRoomsSchema() {
  if (initialization) return initialization;
  initialization = getRoomsDb()
    .then((db) => db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS online_rooms (
        id TEXT PRIMARY KEY NOT NULL,
        host_name TEXT NOT NULL,
        guest_name TEXT,
        host_token_hash TEXT NOT NULL,
        guest_token_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        state_json TEXT,
        version INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`),
      db.prepare(
        "CREATE INDEX IF NOT EXISTS online_rooms_expires_at_idx ON online_rooms (expires_at)",
      ),
    ]))
    .then(() => undefined)
    .catch((error) => {
      initialization = null;
      throw error;
    });
  return initialization;
}
