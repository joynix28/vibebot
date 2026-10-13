import { db } from "../../../core/db.ts";

// Tables du module utility (rappels). Tout est préfixé `util_*` et les
// requêtes sont paramétrées.

db.exec(`
  CREATE TABLE IF NOT EXISTS util_rappels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_util_rappels_due ON util_rappels (remind_at);
  CREATE INDEX IF NOT EXISTS idx_util_rappels_user ON util_rappels (user_id);
`);

export interface Rappel {
  id: number;
  guild_id: string;
  channel_id: string;
  user_id: string;
  message: string;
  remind_at: number;
  created_at: number;
}

export function createRappel(r: {
  guildId: string;
  channelId: string;
  userId: string;
  message: string;
  remindAt: number;
}): Rappel {
  db.run(
    "INSERT INTO util_rappels (guild_id, channel_id, user_id, message, remind_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [r.guildId, r.channelId, r.userId, r.message, r.remindAt, Date.now()]
  );
  const row = db
    .query("SELECT * FROM util_rappels WHERE rowid = last_insert_rowid()")
    .get() as Rappel | null;
  if (!row) throw new Error("Création du rappel impossible.");
  return row;
}

/** Rappels arrivés à échéance (utilisé par le scheduler). */
export function listDueRappels(now: number): Rappel[] {
  return db.query("SELECT * FROM util_rappels WHERE remind_at <= ? ORDER BY remind_at ASC LIMIT 50").all(now) as Rappel[];
}

export function deleteRappel(id: number): void {
  db.run("DELETE FROM util_rappels WHERE id = ?", [id]);
}

/** Nombre de rappels actifs d'un utilisateur (anti-spam). */
export function countActiveRappels(userId: string): number {
  const row = db
    .query("SELECT COUNT(*) AS n FROM util_rappels WHERE user_id = ?")
    .get(userId) as { n: number };
  return row.n;
}
