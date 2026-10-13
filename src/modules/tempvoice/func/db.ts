import { db } from "../../../core/db.ts";

// Tables préfixées par le nom du module (convention du core).
// Schéma repris du bot TempVoice d'origine.

db.exec(`
  CREATE TABLE IF NOT EXISTS tv_temp_channels (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS tv_creator_channels (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS tv_channel_states (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tv_waiting_rooms (
    waiting_id TEXT PRIMARY KEY,
    temp_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tv_user_settings (
    key TEXT PRIMARY KEY,
    settings TEXT NOT NULL
  );
`);

export function addTemp(id: string): void {
  if (!id) return;
  db.run("INSERT OR IGNORE INTO tv_temp_channels (id) VALUES (?)", [id]);
}
export function rmTemp(id: string): void {
  if (!id) return;
  db.run("DELETE FROM tv_temp_channels WHERE id = ?", [id]);
}
export function allTemps(): string[] {
  return db.query("SELECT id FROM tv_temp_channels").all().map((r) => (r as { id: string }).id);
}

export function addCreator(id: string): void {
  db.run("INSERT OR IGNORE INTO tv_creator_channels (id) VALUES (?)", [id]);
}
export function rmCreator(id: string): void {
  db.run("DELETE FROM tv_creator_channels WHERE id = ?", [id]);
}
export function allCreators(): string[] {
  return db.query("SELECT id FROM tv_creator_channels").all().map((r) => (r as { id: string }).id);
}

export function putState(id: string, state: string): void {
  db.run("INSERT INTO tv_channel_states (id, state) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET state = excluded.state", [id, state]);
}
export function delState(id: string): void {
  db.run("DELETE FROM tv_channel_states WHERE id = ?", [id]);
}
export function allStates(): { id: string; state: string }[] {
  return db.query("SELECT id, state FROM tv_channel_states").all() as { id: string; state: string }[];
}

export function addWaiting(waitingId: string, tempId: string): void {
  db.run("INSERT OR REPLACE INTO tv_waiting_rooms (waiting_id, temp_id) VALUES (?, ?)", [waitingId, tempId]);
}
export function rmWaiting(waitingId: string): void {
  db.run("DELETE FROM tv_waiting_rooms WHERE waiting_id = ?", [waitingId]);
}
export function allWaiting(): { waiting_id: string; temp_id: string }[] {
  return db.query("SELECT waiting_id, temp_id FROM tv_waiting_rooms").all() as { waiting_id: string; temp_id: string }[];
}

export function putSettings(key: string, settings: string): void {
  db.run("INSERT INTO tv_user_settings (key, settings) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET settings = excluded.settings", [key, settings]);
}
export function allSettings(): { key: string; settings: string }[] {
  return db.query("SELECT key, settings FROM tv_user_settings").all() as { key: string; settings: string }[];
}
