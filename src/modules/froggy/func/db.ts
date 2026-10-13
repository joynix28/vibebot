import { db } from "../../../core/db.ts";

export type FrogAction = "softban" | "ban" | "disabled";

export const actions: FrogAction[] = ["softban", "ban", "disabled"];

export const tactics = [
  "no_warning",
  "no_dm",
  "dm_rejoin",
  "new_account_only",
  "random_name",
  "random_name_chaos",
] as const;
export type Tactic = (typeof tactics)[number];

export const messages = {
  warning:
    "## DO NOT SEND messages IN THIS CHANNEL\nThis channel is a trap for spam bots. Sending any message here will result in a **{{action:noun}}**.",
  dm: "## {{dm:title}}\nYou were **{{action:text}}** from **{{server:name}}** for sending a message in {{frog:channel:link}}.",
  log: "User **{{user:tag}}** `({{user:id}})` was **{{action:text}}** for sending a message in {{frog:channel:mention}}.",
} as const;

export const action_noun: Record<FrogAction, string> = {
  softban: "kick",
  ban: "ban",
  disabled: "no action",
};

export const action_text: Record<FrogAction, string> = {
  softban: "kicked",
  ban: "banned",
  disabled: "monitored",
};

db.exec(`
  CREATE TABLE IF NOT EXISTS frog_guilds (
    guild_id TEXT PRIMARY KEY,
    trap_channel TEXT,
    log_channel TEXT,
    trap_msg TEXT,
    last_score INTEGER,
    action TEXT NOT NULL DEFAULT 'disabled',
    tactics TEXT NOT NULL DEFAULT '[]',
    warning_msg TEXT NOT NULL DEFAULT '${messages.warning}',
    dm_msg TEXT NOT NULL DEFAULT '${messages.dm}',
    log_msg TEXT NOT NULL DEFAULT '${messages.log}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS frog_catches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_frog_catches_guild ON frog_catches(guild_id, created_at DESC);
`);

try {
  db.exec("ALTER TABLE frog_guilds ADD COLUMN trap_msg TEXT");
} catch {}
try {
  db.exec("ALTER TABLE frog_guilds ADD COLUMN last_score INTEGER");
} catch {}

export interface FrogConfig {
  guild_id: string;
  trap_channel: string | null;
  log_channel: string | null;
  trap_msg: string | null;
  last_score: number | null;
  action: FrogAction;
  tactics: string;
  warning_msg: string;
  dm_msg: string;
  log_msg: string;
  created_at: number;
}

export interface Catch {
  id: number;
  guild_id: string;
  user_id: string;
  action: FrogAction;
  created_at: number;
}

const cache = new Map<string, FrogConfig>();

export function defGuild(id: string): FrogConfig {
  return {
    guild_id: id,
    trap_channel: null,
    log_channel: null,
    trap_msg: null,
    last_score: null,
    action: "disabled",
    tactics: '["no_dm"]',
    warning_msg: messages.warning,
    dm_msg: messages.dm,
    log_msg: messages.log,
    created_at: Date.now(),
  };
}

function rowToConfig(r: any): FrogConfig {
  if (r.created_at == null) r.created_at = 0;
  return r as FrogConfig;
}

export function getGuild(id: string): FrogConfig | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = db.query("SELECT * FROM frog_guilds WHERE guild_id = ?").get(id);
  if (!row) return null;
  const cfg = rowToConfig(row);
  cache.set(id, cfg);
  return cfg;
}

export function invalidate(id: string): void {
  cache.delete(id);
}

export function ensure(id: string): FrogConfig {
  let g = getGuild(id);
  if (g) return g;
  const def = defGuild(id);
  db.run(
    `INSERT INTO frog_guilds (guild_id, trap_channel, log_channel, trap_msg, action, tactics, warning_msg, dm_msg, log_msg, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [def.guild_id, def.trap_channel, def.log_channel, def.trap_msg, def.action, def.tactics, def.warning_msg, def.dm_msg, def.log_msg, def.created_at]
  );
  const row = rowToConfig(db.query("SELECT * FROM frog_guilds WHERE guild_id = ?").get(id)!);
  cache.set(id, row);
  return row;
}

export function saveGuild(g: FrogConfig): void {
  db.run(
    `UPDATE frog_guilds SET trap_channel=?, log_channel=?, action=?, tactics=?, warning_msg=?, dm_msg=?, log_msg=? WHERE guild_id=?`,
    [g.trap_channel, g.log_channel, g.action, g.tactics, g.warning_msg, g.dm_msg, g.log_msg, g.guild_id]
  );
  invalidate(g.guild_id);
}

function patchGuild(guildId: string, patch: Partial<FrogConfig>): void {
  const cols: string[] = [];
  const vals: (string | number | bigint | null)[] = [];
  for (const k of ["trap_channel", "log_channel", "trap_msg", "last_score", "action", "tactics", "warning_msg", "dm_msg", "log_msg"] as const) {
    if (k in patch) {
      cols.push(`${k}=?`);
      vals.push(((patch as any)[k] ?? null) as string | number | bigint | null);
    }
  }
  if (!cols.length) return;
  vals.push(guildId);
  db.run(`UPDATE frog_guilds SET ${cols.join(", ")} WHERE guild_id=?`, vals);
  invalidate(guildId);
}

export function parseTactics(g: FrogConfig): Tactic[] {
  try {
    const t = JSON.parse(g.tactics);
    return Array.isArray(t) ? t : [];
  } catch {
    return [];
  }
}

export function setTactics(guildId: string, tactics: Tactic[]): void {
  ensure(guildId);
  patchGuild(guildId, { tactics: JSON.stringify(tactics) });
}

export function getTactic(guildId: string, tactic: Tactic): boolean {
  return parseTactics(ensure(guildId)).includes(tactic);
}

export function toggleTactic(guildId: string, tactic: Tactic): void {
  const t = parseTactics(ensure(guildId));
  setTactics(guildId, t.includes(tactic) ? t.filter((x) => x !== tactic) : [...t, tactic]);
}

export function setTrapChannel(guildId: string, channelId: string | null): void {
  ensure(guildId);
  patchGuild(guildId, { trap_channel: channelId });
}
export function setLogChannel(guildId: string, channelId: string | null): void {
  ensure(guildId);
  patchGuild(guildId, { log_channel: channelId });
}
export function setTrapMsg(guildId: string, msgId: string | null): void {
  ensure(guildId);
  patchGuild(guildId, { trap_msg: msgId });
}
export function setScore(guildId: string, score: number): void {
  ensure(guildId);
  patchGuild(guildId, { last_score: score });
}
export function setAction(guildId: string, action: FrogAction): void {
  ensure(guildId);
  patchGuild(guildId, { action });
}
export function setMessage(guildId: string, kind: "warning_msg" | "dm_msg" | "log_msg", value: string): void {
  ensure(guildId);
  patchGuild(guildId, { [kind]: value } as Partial<FrogConfig>);
}
export function resetMessages(guildId: string): void {
  ensure(guildId);
  patchGuild(guildId, { warning_msg: messages.warning, dm_msg: messages.dm, log_msg: messages.log });
}

export function addCatch(guildId: string, userId: string, action: FrogAction): void {
  ensure(guildId);
  db.run("INSERT INTO frog_catches (guild_id, user_id, action, created_at) VALUES (?,?,?,?)", [guildId, userId, action, Date.now()]);
}

export function recent(guildId: string, limit = 10): Catch[] {
  return db.query("SELECT * FROM frog_catches WHERE guild_id=? ORDER BY created_at DESC LIMIT ?").all(guildId, limit) as Catch[];
}

export function tot(guildId: string): number {
  return (db.query("SELECT COUNT(*) AS n FROM frog_catches WHERE guild_id=?").get(guildId) as { n: number }).n;
}

export function countUserCatches(userId: string): number {
  return (db.query("SELECT COUNT(*) AS n FROM frog_catches WHERE user_id=?").get(userId) as { n: number }).n;
}

export function gTop(guildId: string, limit = 10): { user_id: string; n: number }[] {
  return db
    .query("SELECT user_id, COUNT(*) AS n FROM frog_catches WHERE guild_id=? GROUP BY user_id ORDER BY n DESC LIMIT ?")
    .all(guildId, limit) as { user_id: string; n: number }[];
}

export function grand(): number {
  return (db.query("SELECT COUNT(*) AS n FROM frog_catches").get() as { n: number }).n;
}

export function today(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return (db.query("SELECT COUNT(*) AS n FROM frog_catches WHERE created_at >= ?").get(start.getTime()) as { n: number }).n;
}

export function servers(): { guild_id: string; n: number }[] {
  return db
    .query("SELECT guild_id, COUNT(*) AS n FROM frog_catches GROUP BY guild_id ORDER BY n DESC")
    .all() as { guild_id: string; n: number }[];
}

export function rank(guildId: string): number {
  const list = servers();
  const idx = list.findIndex((s) => s.guild_id === guildId);
  return idx === -1 ? 0 : idx + 1;
}

export function topServers(limit = 10): { guild_id: string; n: number }[] {
  return db.query("SELECT guild_id, COUNT(*) AS n FROM frog_catches GROUP BY guild_id ORDER BY n DESC LIMIT ?").all(limit) as { guild_id: string; n: number }[];
}

export function topUsers(limit = 10): { user_id: string; n: number }[] {
  return db.query("SELECT user_id, COUNT(*) AS n FROM frog_catches GROUP BY user_id ORDER BY n DESC LIMIT ?").all(limit) as { user_id: string; n: number }[];
}

export function guildCount(): number {
  return (db.query("SELECT COUNT(*) AS n FROM frog_guilds").get() as { n: number }).n;
}
