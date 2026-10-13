import { db } from "../../../core/db.ts";

// Version réduite de la couche DB du bot Xenon, adaptée au bot unifié.
// Utilise la base SQLite partagée (AUCUNE création de Database ici).
// Toutes les tables sont préfixées "backup_" pour éviter toute collision
// avec les autres modules. Seules les fonctions utilisées par les fichiers
// conservés du module backup sont exportées.

db.exec(`
  CREATE TABLE IF NOT EXISTS backup_guilds (
    guild_id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL DEFAULT '/',
    color INTEGER,

    nuke_ban_limit INTEGER NOT NULL DEFAULT 2,
    nuke_kick_limit INTEGER NOT NULL DEFAULT 2,
    nuke_punishment TEXT NOT NULL DEFAULT 'BAN',
    nuke_enabled INTEGER NOT NULL DEFAULT 1,
    nuke_actions TEXT NOT NULL DEFAULT '{}',

    beast_score_limit INTEGER NOT NULL DEFAULT 25,
    beast_ban_score INTEGER NOT NULL DEFAULT 10,
    beast_kick_score INTEGER NOT NULL DEFAULT 5,
    beast_punishment TEXT NOT NULL DEFAULT 'CLEAR_ROLES',
    beast_enabled INTEGER NOT NULL DEFAULT 0,
    beast_scores TEXT NOT NULL DEFAULT '{}',

    raid_enabled INTEGER NOT NULL DEFAULT 1,
    raid_punishment_days INTEGER NOT NULL DEFAULT 2,
    raid_lock_hours INTEGER NOT NULL DEFAULT 2,
    raid_age_bypass_months INTEGER NOT NULL DEFAULT 6,
    raid_score_limit INTEGER NOT NULL DEFAULT 50,
    raid_no_avatar_score INTEGER NOT NULL DEFAULT 5,
    raid_age_score INTEGER NOT NULL DEFAULT 5,
    raid_join_row_score INTEGER NOT NULL DEFAULT 10,

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

    mute_role TEXT,

    security_log TEXT,
    mod_log TEXT,

    premium INTEGER NOT NULL DEFAULT 0,
    whitelist TEXT NOT NULL DEFAULT '{"roles":[],"channels":[],"users":[]}',
    permissions TEXT NOT NULL DEFAULT '{}',

    xp_enabled INTEGER NOT NULL DEFAULT 0,
    xp_difficulty REAL NOT NULL DEFAULT 1.0,
    xp_level_to_xp_ratio REAL NOT NULL DEFAULT 1.0,
    xp_text_cooldown INTEGER NOT NULL DEFAULT 30,
    xp_voice_cooldown INTEGER NOT NULL DEFAULT 30,
    xp_rank_cooldown INTEGER NOT NULL DEFAULT 5,
    xp_keep_roles INTEGER NOT NULL DEFAULT 0,
    xp_reset_leave INTEGER NOT NULL DEFAULT 0,
    xp_reset_ban INTEGER NOT NULL DEFAULT 0,
    xp_notify_enabled INTEGER NOT NULL DEFAULT 0,
    xp_notify_channel TEXT,

    honey_enabled INTEGER NOT NULL DEFAULT 0,
    moderation_enabled INTEGER NOT NULL DEFAULT 0,
    mod_manager_roles TEXT NOT NULL DEFAULT '[]',
    xp_blacklist_roles TEXT NOT NULL DEFAULT '[]',
    xp_blacklist_channels TEXT NOT NULL DEFAULT '[]',
    xp_admin_roles TEXT NOT NULL DEFAULT '[]',
    backup_interval_ms INTEGER NOT NULL DEFAULT 0,
    backup_interval_last INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS backup_owners (
    user_id TEXT NOT NULL,
    backup_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_backup_owner_user ON backup_owners (user_id);

  CREATE TABLE IF NOT EXISTS backup_syncs (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    direction TEXT NOT NULL,
    target TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backup_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_backup_audit_guild ON backup_audit_logs (guild_id, created_at);

  CREATE TABLE IF NOT EXISTS backup_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_backup_changes_guild ON backup_changes (guild_id, created_at);
`);

try {
  db.exec("ALTER TABLE backup_guilds ADD COLUMN backup_interval_ms INTEGER NOT NULL DEFAULT 0");
} catch {}
try {
  db.exec("ALTER TABLE backup_guilds ADD COLUMN backup_interval_last INTEGER NOT NULL DEFAULT 0");
} catch {}

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
  xp_enabled: number;
  xp_difficulty: number;
  xp_level_to_xp_ratio: number;
  xp_text_cooldown: number;
  xp_voice_cooldown: number;
  xp_rank_cooldown: number;
  xp_keep_roles: number;
  xp_reset_leave: number;
  xp_reset_ban: number;
  xp_notify_enabled: number;
  xp_notify_channel: string | null;
  honey_enabled: number;
  moderation_enabled: number;
  mod_manager_roles: string;
  xp_blacklist_roles: string;
  xp_blacklist_channels: string;
  xp_admin_roles: string;
  backup_interval_ms: number;
  backup_interval_last: number;
}

const NUKE_ACTIONS_DEFAULT =
  '{"ban":{"limit":5,"enabled":true},"kick":{"limit":5,"enabled":true},"role_create":{"limit":8,"enabled":true},"role_delete":{"limit":3,"enabled":true},"channel_create":{"limit":8,"enabled":true},"channel_delete":{"limit":3,"enabled":true},"bot":{"enabled":true},"prune":{"enabled":false},"role_update":{"enabled":true},"role_add":{"enabled":true},"invite":{"enabled":false}}';
const BEAST_SCORES_DEFAULT =
  '{"score_limit":25,"ban":10,"kick":5,"channel_create":0,"channel_delete":0,"role_create":0,"role_delete":0,"role_update":0,"role_add":0,"bot_add":0,"prune":0}';

const cache = new Map<string, Guild>();

export function get(id: string): Guild | null {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = db.query("SELECT * FROM backup_guilds WHERE guild_id = ?").get(id) as Guild | null;
  if (row) cache.set(id, row);
  return row;
}

export function inv(id: string): void {
  cache.delete(id);
}

export function defG(id: string): Guild {
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
    xp_enabled: 0, xp_difficulty: 1.0, xp_level_to_xp_ratio: 1.0,
    xp_text_cooldown: 30, xp_voice_cooldown: 30, xp_rank_cooldown: 5,
    xp_keep_roles: 0, xp_reset_leave: 0, xp_reset_ban: 0,
    xp_notify_enabled: 0, xp_notify_channel: null,
    honey_enabled: 0,
    moderation_enabled: 0,
    mod_manager_roles: "[]",
    xp_blacklist_roles: "[]",
    xp_blacklist_channels: "[]",
    xp_admin_roles: "[]",
    backup_interval_ms: 0,
    backup_interval_last: 0,
  };
}

export function g(id: string): Guild {
  let g = get(id);
  if (g) return g;
  const def = defG(id);
  db.run(
    `INSERT INTO backup_guilds (
      guild_id, prefix, color,
      nuke_ban_limit, nuke_kick_limit, nuke_punishment, nuke_enabled, nuke_actions,
      beast_score_limit, beast_ban_score, beast_kick_score, beast_punishment, beast_enabled, beast_scores,
      raid_enabled, raid_punishment_days, raid_lock_hours, raid_age_bypass_months,
      raid_score_limit, raid_no_avatar_score, raid_age_score, raid_join_row_score,
      verify_enabled, verify_type, verify_role, verify_channel,
      captcha_color, captcha_length, captcha_lines, captcha_sensitive, captcha_numbers, captcha_timeout,
      mute_role, security_log, mod_log, premium, whitelist,
      xp_enabled, xp_difficulty, xp_level_to_xp_ratio, xp_text_cooldown, xp_voice_cooldown, xp_rank_cooldown,
      xp_keep_roles, xp_reset_leave, xp_reset_ban, xp_notify_enabled, xp_notify_channel, honey_enabled,
      moderation_enabled, mod_manager_roles, xp_blacklist_roles, xp_blacklist_channels, xp_admin_roles,
      backup_interval_ms, backup_interval_last
    ) VALUES (${["?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"].join(",")})`,
    [
      def.guild_id, def.prefix, def.color,
      def.nuke_ban_limit, def.nuke_kick_limit, def.nuke_punishment, def.nuke_enabled, def.nuke_actions,
      def.beast_score_limit, def.beast_ban_score, def.beast_kick_score, def.beast_punishment, def.beast_enabled, def.beast_scores,
      def.raid_enabled, def.raid_punishment_days, def.raid_lock_hours, def.raid_age_bypass_months,
      def.raid_score_limit, def.raid_no_avatar_score, def.raid_age_score, def.raid_join_row_score,
      def.verify_enabled, def.verify_type, def.verify_role, def.verify_channel,
      def.captcha_color, def.captcha_length, def.captcha_lines, def.captcha_sensitive, def.captcha_numbers, def.captcha_timeout,
      def.mute_role, def.security_log, def.mod_log, def.premium, def.whitelist,
      def.xp_enabled, def.xp_difficulty, def.xp_level_to_xp_ratio, def.xp_text_cooldown, def.xp_voice_cooldown, def.xp_rank_cooldown,
      def.xp_keep_roles, def.xp_reset_leave, def.xp_reset_ban, def.xp_notify_enabled, def.xp_notify_channel, def.honey_enabled,
      def.moderation_enabled, def.mod_manager_roles, def.xp_blacklist_roles, def.xp_blacklist_channels, def.xp_admin_roles,
      def.backup_interval_ms, def.backup_interval_last,
    ]
  );
  const row = get(id)!;
  cache.set(id, row);
  return row;
}

export function sv(g: Guild): void {
  db.run(
    `UPDATE backup_guilds SET
      prefix=?, color=?,
      nuke_ban_limit=?, nuke_kick_limit=?, nuke_punishment=?, nuke_enabled=?,
      beast_score_limit=?, beast_ban_score=?, beast_kick_score=?, beast_punishment=?, beast_enabled=?,
      raid_enabled=?, raid_punishment_days=?, raid_lock_hours=?, raid_age_bypass_months=?,
      raid_score_limit=?, raid_no_avatar_score=?, raid_age_score=?, raid_join_row_score=?,
      verify_enabled=?, verify_type=?, verify_role=?, verify_channel=?,
      captcha_color=?, captcha_length=?, captcha_lines=?, captcha_sensitive=?, captcha_numbers=?, captcha_timeout=?,
      mute_role=?, security_log=?, mod_log=?, premium=?, whitelist=?,
      xp_enabled=?, xp_difficulty=?, xp_level_to_xp_ratio=?, xp_text_cooldown=?, xp_voice_cooldown=?, xp_rank_cooldown=?,
      xp_keep_roles=?, xp_reset_leave=?, xp_reset_ban=?, xp_notify_enabled=?, xp_notify_channel=?, honey_enabled=?,
      moderation_enabled=?, mod_manager_roles=?, xp_blacklist_roles=?, xp_blacklist_channels=?, xp_admin_roles=?,
      backup_interval_ms=?, backup_interval_last=?
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
      g.xp_enabled, g.xp_difficulty, g.xp_level_to_xp_ratio, g.xp_text_cooldown, g.xp_voice_cooldown, g.xp_rank_cooldown,
      g.xp_keep_roles, g.xp_reset_leave, g.xp_reset_ban, g.xp_notify_enabled, g.xp_notify_channel, g.honey_enabled,
      g.moderation_enabled, g.mod_manager_roles, g.xp_blacklist_roles, g.xp_blacklist_channels, g.xp_admin_roles,
      g.backup_interval_ms, g.backup_interval_last,
      g.guild_id,
    ]
  );
  inv(g.guild_id);
  cache.set(g.guild_id, get(g.guild_id)!);
}

export function permLvl(guildId: string): string {
  const cfg = g(guildId);
  try {
    const p = JSON.parse(cfg.permissions);
    return typeof p.level === "string" ? p.level : "safe";
  } catch {
    return "safe";
  }
}

export function setPermLvl(guildId: string, level: string): void {
  const cfg = g(guildId);
  let p: any = {};
  try { p = JSON.parse(cfg.permissions); } catch {}
  p.level = level;
  db.run("UPDATE backup_guilds SET permissions=? WHERE guild_id=?", [JSON.stringify(p), guildId]);
  inv(guildId);
}

// ---- backup ownership ----
export function ownAdd(userId: string, backupId: string): void {
  db.run("INSERT OR IGNORE INTO backup_owners (user_id, backup_id, created_at) VALUES (?,?,?)", [userId, backupId, Date.now()]);
}

export function ownDel(userId: string, backupId: string): void {
  db.run("DELETE FROM backup_owners WHERE user_id=? AND backup_id=?", [userId, backupId]);
}

export function ownList(userId: string): string[] {
  return (db.query("SELECT backup_id FROM backup_owners WHERE user_id=? ORDER BY created_at DESC").all(userId) as { backup_id: string }[]).map((r) => r.backup_id);
}

export function bid(id: string): boolean {
  return !!db.query("SELECT 1 FROM backup_owners WHERE backup_id=?").get(id);
}

export function ownExpired(prefix: string, maxAge: number): { user_id: string; backup_id: string }[] {
  const cutoff = Date.now() - maxAge;
  return db.query("SELECT user_id, backup_id FROM backup_owners WHERE backup_id LIKE ? AND created_at < ?").all(`${prefix}%`, cutoff) as { user_id: string; backup_id: string }[];
}

// ---- syncs ----
interface SyncRow {
  id: string;
  guild_id: string;
  user_id: string;
  type: string;
  direction: string;
  target: string;
  created_at: number;
}

export function syAdd(s: SyncRow): void {
  db.run("INSERT OR REPLACE INTO backup_syncs (id, guild_id, user_id, type, direction, target, created_at) VALUES (?,?,?,?,?,?,?)", [s.id, s.guild_id, s.user_id, s.type, s.direction, s.target, s.created_at]);
}

export function syDel(id: string): void {
  db.run("DELETE FROM backup_syncs WHERE id=?", [id]);
}

export function syList(guildId: string): SyncRow[] {
  return db.query("SELECT * FROM backup_syncs WHERE guild_id=? ORDER BY created_at DESC").all(guildId) as SyncRow[];
}

export function syAll(): SyncRow[] {
  return db.query("SELECT * FROM backup_syncs").all() as SyncRow[];
}

// ---- audit logs ----
interface AuditLog {
  id: number;
  guild_id: string;
  user_id: string;
  action: number;
  description: string;
  created_at: number;
}

export const ACT = {
  BACKUP_CREATE: 0,
  BACKUP_LOAD: 1,
  BACKUP_INTERVAL_ENABLE: 2,
  BACKUP_INTERVAL_DISABLE: 3,
  TEMPLATE_LOAD: 4,
  COPY: 5,
  CHATLOG_CREATE: 6,
  CHATLOG_LOAD: 7,
  MESSAGE_SYNC_CREATE: 8,
  BAN_SYNC_CREATE: 9,
  SYNC_DELETE: 10,
  ROLE_SYNC_CREATE: 11,
  BACKUP_SYNC_CREATE: 12,
  IMPORT_GUILD: 13,
} as const;

export function aud(guildId: string, userId: string, action: number, description: string): void {
  db.run("INSERT INTO backup_audit_logs (guild_id, user_id, action, description, created_at) VALUES (?,?,?,?,?)", [guildId, userId, action, description, Date.now()]);
}

export function alList(guildId: string, actions: number[], limit = 10, offset = 0): AuditLog[] {
  if (actions.length === 0) return [];
  const placeholders = actions.map(() => "?").join(",");
  return db.query(
    `SELECT * FROM backup_audit_logs WHERE guild_id=? AND action IN (${placeholders}) ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(guildId, ...actions, limit, offset) as AuditLog[];
}

export function alCnt(guildId: string, actions: number[]): number {
  if (actions.length === 0) return 0;
  const placeholders = actions.map(() => "?").join(",");
  return (db.query(`SELECT COUNT(*) AS n FROM backup_audit_logs WHERE guild_id=? AND action IN (${placeholders})`).get(guildId, ...actions) as { n: number }).n;
}

// ---- change tracking ----
interface Chg {
  id: number;
  guild_id: string;
  type: string;
  description: string;
  created_at: number;
}

export function clChg(guildId: string, type: string, description: string): void {
  db.run("INSERT INTO backup_changes (guild_id, type, description, created_at) VALUES (?,?,?,?)", [guildId, type, description, Date.now()]);
}

export function lsChg(guildId: string, limit = 25): Chg[] {
  return db.query("SELECT * FROM backup_changes WHERE guild_id=? ORDER BY created_at DESC LIMIT ?").all(guildId, limit) as Chg[];
}
