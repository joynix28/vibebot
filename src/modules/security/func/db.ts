import { db } from "../../../core/db.ts";

// Tables préfixées par le nom du module (convention du core).
// Le schéma et la logique de migration sont repris du bot Security d'origine.

db.exec(`
  CREATE TABLE IF NOT EXISTS security_guilds (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL DEFAULT '/',
    color INTEGER,

    -- anti nuke
    nuke_ban_limit INTEGER NOT NULL DEFAULT 2,
    nuke_kick_limit INTEGER NOT NULL DEFAULT 2,
    nuke_punishment TEXT NOT NULL DEFAULT 'BAN',
    nuke_enabled INTEGER NOT NULL DEFAULT 1,
    nuke_actions TEXT NOT NULL DEFAULT '{}',

    -- beast mode
    beast_score_limit INTEGER NOT NULL DEFAULT 25,
    beast_ban_score INTEGER NOT NULL DEFAULT 10,
    beast_kick_score INTEGER NOT NULL DEFAULT 5,
    beast_punishment TEXT NOT NULL DEFAULT 'CLEAR_ROLES',
    beast_enabled INTEGER NOT NULL DEFAULT 0,
    beast_scores TEXT NOT NULL DEFAULT '{}',

    -- anti raid
    raid_enabled INTEGER NOT NULL DEFAULT 1,
    raid_punishment_days INTEGER NOT NULL DEFAULT 2,
    raid_lock_hours INTEGER NOT NULL DEFAULT 2,
    raid_age_bypass_months INTEGER NOT NULL DEFAULT 6,
    raid_score_limit INTEGER NOT NULL DEFAULT 50,
    raid_no_avatar_score INTEGER NOT NULL DEFAULT 5,
    raid_age_score INTEGER NOT NULL DEFAULT 5,
    raid_join_row_score INTEGER NOT NULL DEFAULT 10,

    -- verification
    verify_enabled INTEGER NOT NULL DEFAULT 0,
    verify_type TEXT NOT NULL DEFAULT 'CAPTCHA',
    verify_role TEXT,
    verify_channel TEXT,
    captcha_color TEXT NOT NULL DEFAULT '#2b2d31',
    captcha_length INTEGER NOT NULL DEFAULT 6,
    captcha_lines INTEGER NOT NULL DEFAULT 4,
    captcha_sensitive INTEGER NOT NULL DEFAULT 0,
    captcha_numbers INTEGER NOT NULL DEFAULT 0,
    captcha_timeout INTEGER NOT NULL DEFAULT 120,

    -- moderation
    mute_role TEXT,

    -- logs
    security_log TEXT,
    mod_log TEXT,

    premium INTEGER NOT NULL DEFAULT 0,
    whitelist TEXT NOT NULL DEFAULT '{"roles":[],"channels":[],"users":[]}',
    permissions TEXT NOT NULL DEFAULT '{}'
  );
`);

export interface Guild {
  guild_id: string;
  prefix: string;
  color: number | null;
  nuke_ban_limit: number;
  nuke_kick_limit: number;
  nuke_punishment: string;
  nuke_enabled: number;
  nuke_actions: string;
  beast_score_limit: number;
  beast_ban_score: number;
  beast_kick_score: number;
  beast_punishment: string;
  beast_enabled: number;
  beast_scores: string;
  raid_enabled: number;
  raid_punishment_days: number;
  raid_lock_hours: number;
  raid_age_bypass_months: number;
  raid_score_limit: number;
  raid_no_avatar_score: number;
  raid_age_score: number;
  raid_join_row_score: number;
  verify_enabled: number;
  verify_type: string;
  verify_role: string | null;
  verify_channel: string | null;
  captcha_color: string;
  captcha_length: number;
  captcha_lines: number;
  captcha_sensitive: number;
  captcha_numbers: number;
  captcha_timeout: number;
  mute_role: string | null;
  security_log: string | null;
  mod_log: string | null;
  premium: number;
  whitelist: string;
  permissions: string;
}

const COLS = db.query("PRAGMA table_info(security_guilds)").all() as { name: string }[];

const NUKE_ACTIONS_DEFAULT =
  '{"ban":{"limit":5,"enabled":true},"kick":{"limit":5,"enabled":true},"role_create":{"limit":8,"enabled":true},"role_delete":{"limit":3,"enabled":true},"channel_create":{"limit":8,"enabled":true},"channel_delete":{"limit":3,"enabled":true},"bot":{"enabled":true},"prune":{"enabled":false},"role_update":{"enabled":true},"role_add":{"enabled":true},"invite":{"enabled":false}}';
const BEAST_SCORES_DEFAULT =
  '{"score_limit":25,"ban":10,"kick":5,"channel_create":0,"channel_delete":0,"role_create":0,"role_delete":0,"role_update":0,"role_add":0,"bot_add":0,"prune":0}';

{
  const add: [string, string][] = [
    ["nuke_actions", "TEXT NOT NULL DEFAULT '{}'"],
    ["beast_scores", "TEXT NOT NULL DEFAULT '{}'"],
    ["beast_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["permissions", "TEXT NOT NULL DEFAULT '{}'"],
  ];
  for (const [name, def] of add) {
    if (!COLS.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE security_guilds ADD COLUMN ${name} ${def}`);
    }
  }
  db.run("UPDATE security_guilds SET captcha_length = 6 WHERE captcha_length < 6");
  db.run("UPDATE security_guilds SET verify_type = 'CAPTCHA' WHERE verify_type = 'BUTTON'");
  const rows = db
    .query("SELECT guild_id, nuke_actions, beast_scores FROM security_guilds")
    .all() as { guild_id: string; nuke_actions: string | null; beast_scores: string | null }[];
  const defNa = JSON.parse(NUKE_ACTIONS_DEFAULT) as Record<string, unknown>;
  const defBs = JSON.parse(BEAST_SCORES_DEFAULT) as Record<string, unknown>;
  for (const r of rows) {
    let na = {} as Record<string, unknown>;
    let bs = {} as Record<string, unknown>;
    try { na = r.nuke_actions ? JSON.parse(r.nuke_actions) : {}; } catch {}
    try { bs = r.beast_scores ? JSON.parse(r.beast_scores) : {}; } catch {}
    const mergedNa = { ...defNa, ...na };
    const mergedBs = { ...defBs, ...bs };
    db.run("UPDATE security_guilds SET nuke_actions = ?, beast_scores = ? WHERE guild_id = ?", [
      JSON.stringify(mergedNa),
      JSON.stringify(mergedBs),
      r.guild_id,
    ]);
  }
}

const cache = new Map<string, Guild>();

export function getGuild(id: string): Guild | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = db.query("SELECT * FROM security_guilds WHERE guild_id = ?").get(id) as Guild | null;
  if (row) cache.set(id, row);
  return row;
}

export function invalidate(id: string): void {
  cache.delete(id);
}

export function defGuild(id: string): Guild {
  return {
    guild_id: id,
    prefix: "/",
    color: null,
    nuke_ban_limit: 2, nuke_kick_limit: 2, nuke_punishment: "BAN", nuke_enabled: 1,
    nuke_actions: NUKE_ACTIONS_DEFAULT,
    beast_score_limit: 25, beast_ban_score: 10, beast_kick_score: 5, beast_punishment: "CLEAR_ROLES", beast_enabled: 0,
    beast_scores: BEAST_SCORES_DEFAULT,
    raid_enabled: 1, raid_punishment_days: 2, raid_lock_hours: 2, raid_age_bypass_months: 6,
    raid_score_limit: 50, raid_no_avatar_score: 5, raid_age_score: 5, raid_join_row_score: 10,
    verify_enabled: 0, verify_type: "CAPTCHA", verify_role: null, verify_channel: null,
    captcha_color: "#2b2d31", captcha_length: 6, captcha_lines: 4, captcha_sensitive: 0,
    captcha_numbers: 0, captcha_timeout: 120,
    mute_role: null, security_log: null, mod_log: null,
    premium: 0,
    whitelist: '{"roles":[],"channels":[],"users":[]}',
    permissions: "{}",
  };
}

export function ensureGuild(id: string): Guild {
  let g = getGuild(id);
  if (g) return g;
  const def = defGuild(id);
  db.run(
    `INSERT INTO security_guilds (
      guild_id, prefix, color,
      nuke_ban_limit, nuke_kick_limit, nuke_punishment, nuke_enabled, nuke_actions,
      beast_score_limit, beast_ban_score, beast_kick_score, beast_punishment, beast_enabled, beast_scores,
      raid_enabled, raid_punishment_days, raid_lock_hours, raid_age_bypass_months,
      raid_score_limit, raid_no_avatar_score, raid_age_score, raid_join_row_score,
      verify_enabled, verify_type, verify_role, verify_channel,
      captcha_color, captcha_length, captcha_lines, captcha_sensitive, captcha_numbers, captcha_timeout,
      mute_role, security_log, mod_log, premium, whitelist
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      def.guild_id, def.prefix, def.color,
      def.nuke_ban_limit, def.nuke_kick_limit, def.nuke_punishment, def.nuke_enabled, def.nuke_actions,
      def.beast_score_limit, def.beast_ban_score, def.beast_kick_score, def.beast_punishment, def.beast_enabled, def.beast_scores,
      def.raid_enabled, def.raid_punishment_days, def.raid_lock_hours, def.raid_age_bypass_months,
      def.raid_score_limit, def.raid_no_avatar_score, def.raid_age_score, def.raid_join_row_score,
      def.verify_enabled, def.verify_type, def.verify_role, def.verify_channel,
      def.captcha_color, def.captcha_length, def.captcha_lines, def.captcha_sensitive, def.captcha_numbers, def.captcha_timeout,
      def.mute_role, def.security_log, def.mod_log, def.premium, def.whitelist,
    ]
  );
  const row = getGuild(id)!;
  cache.set(id, row);
  return row;
}

export function saveGuild(g: Guild): void {
  db.run(
    `UPDATE security_guilds SET
      prefix=?, color=?,
      nuke_ban_limit=?, nuke_kick_limit=?, nuke_punishment=?, nuke_enabled=?,
      beast_score_limit=?, beast_ban_score=?, beast_kick_score=?, beast_punishment=?, beast_enabled=?,
      raid_enabled=?, raid_punishment_days=?, raid_lock_hours=?, raid_age_bypass_months=?,
      raid_score_limit=?, raid_no_avatar_score=?, raid_age_score=?, raid_join_row_score=?,
      verify_enabled=?, verify_type=?, verify_role=?, verify_channel=?,
      captcha_color=?, captcha_length=?, captcha_lines=?, captcha_sensitive=?, captcha_numbers=?, captcha_timeout=?,
      mute_role=?, security_log=?, mod_log=?, premium=?, whitelist=?
    WHERE guild_id=?`,
    [
      g.prefix, g.color,
      g.nuke_ban_limit, g.nuke_kick_limit, g.nuke_punishment, g.nuke_enabled,
      g.beast_score_limit, g.beast_ban_score, g.beast_kick_score, g.beast_punishment, g.beast_enabled,
      g.raid_enabled, g.raid_punishment_days, g.raid_lock_hours, g.raid_age_bypass_months,
      g.raid_score_limit, g.raid_no_avatar_score, g.raid_age_score, g.raid_join_row_score,
      g.verify_enabled, g.verify_type, g.verify_role, g.verify_channel,
      g.captcha_color, g.captcha_length, g.captcha_lines, g.captcha_sensitive, g.captcha_numbers, g.captcha_timeout,
      g.mute_role, g.security_log, g.mod_log, g.premium, g.whitelist,
      g.guild_id,
    ]
  );
  invalidate(g.guild_id);
  cache.set(g.guild_id, getGuild(g.guild_id)!);
}

export type Whitelist = { roles: string[]; channels: string[]; users: string[] };

export function parseWhitelist(g: Guild): Whitelist {
  try { return JSON.parse(g.whitelist); } catch { return { roles: [], channels: [], users: [] }; }
}

export function saveWhitelist(guildId: string, wl: Whitelist): void {
  ensureGuild(guildId);
  db.run("UPDATE security_guilds SET whitelist=? WHERE guild_id=?", [JSON.stringify(wl), guildId]);
  invalidate(guildId);
}

export function setWhitelistField(guildId: string, field: keyof Whitelist, ids: string[]): void {
  const wl = parseWhitelist(ensureGuild(guildId));
  (wl as any)[field] = ids;
  saveWhitelist(guildId, wl);
}

export function wlAdd(guildId: string, field: keyof Whitelist, id: string): void {
  const wl = parseWhitelist(ensureGuild(guildId));
  if (!(wl as any)[field].includes(id)) (wl as any)[field].push(id);
  saveWhitelist(guildId, wl);
}

export function wlRemove(guildId: string, field: keyof Whitelist, id: string): void {
  const wl = parseWhitelist(ensureGuild(guildId));
  (wl as any)[field] = (wl as any)[field].filter((x: string) => x !== id);
  saveWhitelist(guildId, wl);
}

export function guildCount(): number {
  return (db.query("SELECT COUNT(*) AS n FROM security_guilds").get() as { n: number }).n;
}

export type NukeAction = { limit?: number; enabled?: boolean };
export function parseNukeActions(g: Guild): Record<string, NukeAction> {
  try { return JSON.parse(g.nuke_actions); } catch { return {}; }
}

export function setNukeAction(guildId: string, action: string, patch: NukeAction): void {
  const acts = parseNukeActions(ensureGuild(guildId));
  acts[action] = { ...(acts[action] ?? {}), ...patch };
  db.run("UPDATE security_guilds SET nuke_actions=? WHERE guild_id=?", [JSON.stringify(acts), guildId]);
  invalidate(guildId);
}

export function parseBeastScores(g: Guild): Record<string, number> {
  try { return JSON.parse(g.beast_scores); } catch { return {}; }
}

export function setBeastScore(guildId: string, key: string, val: number): void {
  const scores = parseBeastScores(ensureGuild(guildId));
  scores[key] = val;
  db.run("UPDATE security_guilds SET beast_scores=? WHERE guild_id=?", [JSON.stringify(scores), guildId]);
  invalidate(guildId);
}

export function parsePerms(g: Guild): Record<string, number[]> {
  try { return JSON.parse(g.permissions); } catch { return {}; }
}

export function getPerms(guildId: string, userId: string): number[] {
  return parsePerms(ensureGuild(guildId))[userId] ?? [];
}

export function addPerm(guildId: string, userId: string, permission: number): void {
  const perms = parsePerms(ensureGuild(guildId));
  const list = perms[userId] ?? [];
  if (!list.includes(permission)) list.push(permission);
  perms[userId] = list;
  db.run("UPDATE security_guilds SET permissions=? WHERE guild_id=?", [JSON.stringify(perms), guildId]);
  invalidate(guildId);
}

export function removePerm(guildId: string, userId: string, permission: number): void {
  const perms = parsePerms(ensureGuild(guildId));
  perms[userId] = (perms[userId] ?? []).filter((p) => p !== permission);
  db.run("UPDATE security_guilds SET permissions=? WHERE guild_id=?", [JSON.stringify(perms), guildId]);
  invalidate(guildId);
}

export function resetPerms(guildId: string, userId: string): void {
  const perms = parsePerms(ensureGuild(guildId));
  delete perms[userId];
  db.run("UPDATE security_guilds SET permissions=? WHERE guild_id=?", [JSON.stringify(perms), guildId]);
  invalidate(guildId);
}

export function hasPerm(guildId: string, userId: string, permission: number): boolean {
  return getPerms(guildId, userId).includes(permission);
}

export function usersWithPerm(guildId: string, permission: number): string[] {
  const perms = parsePerms(ensureGuild(guildId));
  return Object.entries(perms).filter(([, list]) => list.includes(permission)).map(([id]) => id);
}
