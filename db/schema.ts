import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const onlineRooms = sqliteTable(
  "online_rooms",
  {
    id: text("id").primaryKey(),
    hostName: text("host_name").notNull(),
    guestName: text("guest_name"),
    hostTokenHash: text("host_token_hash").notNull(),
    guestTokenHash: text("guest_token_hash").notNull(),
    status: text("status", { enum: ["waiting", "active", "complete"] })
      .notNull()
      .default("waiting"),
    stateJson: text("state_json"),
    version: integer("version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("online_rooms_expires_at_idx").on(table.expiresAt)],
);

export type OnlineRoomRow = typeof onlineRooms.$inferSelect;

export const realmRooms = sqliteTable(
  "realm_rooms",
  {
    id: text("id").primaryKey(),
    hostName: text("host_name").notNull(),
    guestName: text("guest_name"),
    hostTokenHash: text("host_token_hash").notNull(),
    guestTokenHash: text("guest_token_hash").notNull(),
    status: text("status", { enum: ["waiting", "active", "complete"] })
      .notNull()
      .default("waiting"),
    stateJson: text("state_json"),
    version: integer("version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("realm_rooms_expires_at_idx").on(table.expiresAt)],
);

export type RealmRoomRow = typeof realmRooms.$inferSelect;
