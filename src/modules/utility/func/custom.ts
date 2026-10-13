import { db } from "../../../core/db.ts";

// Commandes personnalisées du serveur : nom + réponse texte, déclenchées
// depuis le hub /custom via des boutons.

db.exec(`
  CREATE TABLE IF NOT EXISTS util_custom_commands (
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    response TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, name)
  );
`);

export interface CustomCommand {
  guild_id: string;
  name: string;
  response: string;
  created_by: string;
  created_at: number;
}

export function listCustomCommands(guildId: string): CustomCommand[] {
  return db
    .query("SELECT * FROM util_custom_commands WHERE guild_id = ? ORDER BY name ASC")
    .all(guildId) as CustomCommand[];
}

export function getCustomCommand(guildId: string, name: string): CustomCommand | null {
  const row = db
    .query("SELECT * FROM util_custom_commands WHERE guild_id = ? AND name = ?")
    .get(guildId, name) as CustomCommand | null;
  return row ?? null;
}

/** Normalise un nom de commande perso (minuscules, lettres/chiffres/-/_.). */
export function normalizeName(raw: string): string | null {
  const name = raw.trim().toLowerCase().replace(/\s+/g, "-");
  if (!/^[a-z0-9_-]{1,32}$/.test(name)) return null;
  return name;
}

export function createCustomCommand(guildId: string, name: string, response: string, authorId: string): boolean {
  if (getCustomCommand(guildId, name)) return false;
  db.query(
    "INSERT INTO util_custom_commands (guild_id, name, response, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(guildId, name, response, authorId, Date.now());
  return true;
}

export function deleteCustomCommand(guildId: string, name: string): boolean {
  const res = db.query("DELETE FROM util_custom_commands WHERE guild_id = ? AND name = ?").run(guildId, name);
  return res.changes > 0;
}
