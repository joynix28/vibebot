import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// Base SQLite partagée par tous les modules.
// Chaque module crée ses propres tables (préfixées par son nom) au chargement
// de son fichier func/db.ts, en important { db } depuis ce fichier.

const dataDir = path.resolve(import.meta.dir, "../../data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "fusion.db"));
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS module_state (
    guild_id TEXT NOT NULL,
    module TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (guild_id, module)
  );
`);

/** État d'un module pour un serveur (activé par défaut). */
export function isModuleEnabled(guildId: string, module: string): boolean {
  const row = db
    .query("SELECT enabled FROM module_state WHERE guild_id = ? AND module = ?")
    .get(guildId, module) as { enabled: number } | null;
  return row ? row.enabled === 1 : true;
}

export function setModuleEnabled(guildId: string, module: string, enabled: boolean): void {
  db.run(
    "INSERT INTO module_state (guild_id, module, enabled) VALUES (?, ?, ?) ON CONFLICT(guild_id, module) DO UPDATE SET enabled = excluded.enabled",
    [guildId, module, enabled ? 1 : 0]
  );
}
