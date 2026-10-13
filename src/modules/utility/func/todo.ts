import { db } from "../../../core/db.ts";

// Liste de tâches personnelle persistante (par utilisateur et par serveur).

db.exec(`
  CREATE TABLE IF NOT EXISTS util_todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_util_todos_user ON util_todos (guild_id, user_id);
`);

export interface Todo {
  id: number;
  guild_id: string;
  user_id: string;
  text: string;
  done: number;
  created_at: number;
}

export function listTodos(guildId: string, userId: string): Todo[] {
  return db
    .query("SELECT * FROM util_todos WHERE guild_id = ? AND user_id = ? ORDER BY done ASC, id ASC")
    .all(guildId, userId) as Todo[];
}

export function addTodo(guildId: string, userId: string, text: string): void {
  db.query("INSERT INTO util_todos (guild_id, user_id, text, done, created_at) VALUES (?, ?, ?, 0, ?)")
    .run(guildId, userId, text, Date.now());
}

export function toggleTodo(guildId: string, userId: string, todoId: number): boolean {
  const res = db
    .query("UPDATE util_todos SET done = 1 - done WHERE guild_id = ? AND user_id = ? AND id = ?")
    .run(guildId, userId, todoId);
  return res.changes > 0;
}

export function deleteTodo(guildId: string, userId: string, todoId: number): boolean {
  const res = db.query("DELETE FROM util_todos WHERE guild_id = ? AND user_id = ? AND id = ?").run(guildId, userId, todoId);
  return res.changes > 0;
}

export function clearDoneTodos(guildId: string, userId: string): number {
  const res = db.query("DELETE FROM util_todos WHERE guild_id = ? AND user_id = ? AND done = 1").run(guildId, userId);
  return Number(res.changes);
}
