import { db } from "../../../core/db.ts";

// Dossier de modération : historique des sanctions (cases) et notes privées
// du staff sur les membres.

db.exec(`
  CREATE TABLE IF NOT EXISTS mod_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    case_num INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'Aucune raison précisée',
    moderator_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (guild_id, case_num)
  );
  CREATE INDEX IF NOT EXISTS idx_mod_cases_guild_user ON mod_cases (guild_id, user_id);
  CREATE TABLE IF NOT EXISTS user_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    note TEXT NOT NULL,
    author_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_notes_guild_user ON user_notes (guild_id, user_id);
`);

export type CaseType = "ban" | "kick" | "mute" | "warn" | "unban" | "unmute";

export interface ModCase {
  id: number;
  guild_id: string;
  case_num: number;
  user_id: string;
  type: string;
  reason: string;
  moderator_id: string;
  created_at: number;
}

export interface UserNote {
  id: number;
  guild_id: string;
  user_id: string;
  note: string;
  author_id: string;
  created_at: number;
}

/** Enregistre une sanction et renvoie son numéro de dossier. */
export function logCase(
  guildId: string,
  userId: string,
  type: CaseType,
  reason: string,
  moderatorId: string
): number {
  const next =
    (db
      .query("SELECT COALESCE(MAX(case_num), 0) AS m FROM mod_cases WHERE guild_id = ?")
      .get(guildId) as { m: number }).m + 1;
  db.query(
    "INSERT INTO mod_cases (guild_id, case_num, user_id, type, reason, moderator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(guildId, next, userId, type, reason || "Aucune raison précisée", moderatorId, Date.now());
  return next;
}

/** Historique des sanctions d'un membre (plus récent en premier). */
export function getCases(guildId: string, userId: string, limit = 10): ModCase[] {
  return db
    .query("SELECT * FROM mod_cases WHERE guild_id = ? AND user_id = ? ORDER BY case_num DESC LIMIT ?")
    .all(guildId, userId, limit) as ModCase[];
}

export function countCases(guildId: string, userId: string): number {
  return (db
    .query("SELECT COUNT(*) AS c FROM mod_cases WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as { c: number }).c;
}

/** Ajoute une note privée du staff sur un membre. */
export function addNote(guildId: string, userId: string, note: string, authorId: string): number {
  const res = db
    .query("INSERT INTO user_notes (guild_id, user_id, note, author_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(guildId, userId, note, authorId, Date.now());
  return Number(res.lastInsertRowid);
}

/** Notes privées sur un membre (plus récentes en premier). */
export function getNotes(guildId: string, userId: string, limit = 10): UserNote[] {
  return db
    .query("SELECT * FROM user_notes WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?")
    .all(guildId, userId, limit) as UserNote[];
}

/** Supprime une note. Renvoie true si une note a été supprimée. */
export function deleteNote(guildId: string, noteId: number): boolean {
  const res = db
    .query("DELETE FROM user_notes WHERE guild_id = ? AND id = ?")
    .run(guildId, noteId);
  return res.changes > 0;
}
