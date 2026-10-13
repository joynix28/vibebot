import { db } from "../../../core/db.ts";

// Tables du module protection (NdProtect porté).
// Ce fichier est le propriétaire de ces tables : les autres modules
// passent par les helpers exportés ci-dessous.

db.exec(`
CREATE TABLE IF NOT EXISTS protect_config (guild_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS protect_whitelist (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS protect_snipes (guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (guild_id, channel_id));
CREATE TABLE IF NOT EXISTS protect_tempbans (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, unban_at INTEGER NOT NULL, PRIMARY KEY (guild_id, user_id));
`);

export interface AntiraidFlags {
  bots: boolean;
  webhooks: boolean;
  members: boolean;
  channels: boolean;
  roles: boolean;
  identity: boolean;
  permissions: boolean;
  punish: "ban" | "kick" | "derank" | "mute";
}

export interface ProtectConfig {
  antiraid: AntiraidFlags;
  antispam: { enabled: boolean; allowedChannels: string[]; autoraidmode: boolean; autoraidLimit: number };
  automod: { links: { enabled: boolean; channels: string[] }; invites: { enabled: boolean; channels: string[] } };
  welcome: { roles: { enabled: boolean; roleIds: string[] }; ghostping: { enabled: boolean; channels: string[] } };
  logs: {
    autoConfigured: boolean;
    categoryId: string | null;
    antiraid: string | null;
    moderation: string | null;
    members: string | null;
    server: string | null;
    messages: string | null;
  };
  raidmode: boolean;
  muteRole: string | null;
}

const DEFAULT_CONFIG: ProtectConfig = {
  antiraid: {
    bots: true,
    webhooks: true,
    members: true,
    channels: true,
    roles: true,
    identity: true,
    permissions: true,
    punish: "ban",
  },
  antispam: { enabled: true, allowedChannels: [], autoraidmode: true, autoraidLimit: 10 },
  automod: { links: { enabled: true, channels: [] }, invites: { enabled: true, channels: [] } },
  welcome: { roles: { enabled: true, roleIds: [] }, ghostping: { enabled: true, channels: [] } },
  logs: {
    autoConfigured: false,
    categoryId: null,
    antiraid: null,
    moderation: null,
    members: null,
    server: null,
    messages: null,
  },
  raidmode: false,
  muteRole: null,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(override)) return base;
  if (!isPlainObject(base)) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function sanitize(cfg: ProtectConfig): ProtectConfig {
  if (!["ban", "kick", "derank", "mute"].includes(cfg.antiraid.punish)) cfg.antiraid.punish = "ban";
  if (!Number.isFinite(cfg.antispam.autoraidLimit) || cfg.antispam.autoraidLimit < 2) {
    cfg.antispam.autoraidLimit = 10;
  }
  cfg.antispam.allowedChannels = asStringArray(cfg.antispam.allowedChannels);
  cfg.automod.links.channels = asStringArray(cfg.automod.links.channels);
  cfg.automod.invites.channels = asStringArray(cfg.automod.invites.channels);
  cfg.welcome.roles.roleIds = asStringArray(cfg.welcome.roles.roleIds);
  cfg.welcome.ghostping.channels = asStringArray(cfg.welcome.ghostping.channels);
  return cfg;
}

/** Configuration de protection d'un serveur (valeurs par défaut fusionnées). Crée la ligne si absente. */
export function getProtectConfig(guildId: string): ProtectConfig {
  const row = db.query("SELECT data FROM protect_config WHERE guild_id = ?").get(guildId) as {
    data: string;
  } | null;
  let parsed: unknown = {};
  if (row) {
    try {
      parsed = JSON.parse(row.data) as unknown;
    } catch {
      parsed = {};
    }
  } else {
    db.query("INSERT OR IGNORE INTO protect_config (guild_id, data) VALUES (?, ?)").run(guildId, "{}");
  }
  return sanitize(deepMerge(structuredClone(DEFAULT_CONFIG), parsed));
}

export function saveProtectConfig(guildId: string, cfg: ProtectConfig): void {
  db.query(
    "INSERT INTO protect_config (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data",
  ).run(guildId, JSON.stringify(cfg));
}

export function getWhitelist(guildId: string): string[] {
  const rows = db.query("SELECT user_id FROM protect_whitelist WHERE guild_id = ?").all(guildId) as Array<{
    user_id: string;
  }>;
  return rows.map((r) => r.user_id);
}

export function addWhitelist(guildId: string, userId: string): void {
  db.query("INSERT OR IGNORE INTO protect_whitelist (guild_id, user_id) VALUES (?, ?)").run(guildId, userId);
}

export function removeWhitelist(guildId: string, userId: string): void {
  db.query("DELETE FROM protect_whitelist WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
}

/** true si userId est le propriétaire du serveur ou figure dans la whitelist. */
export function isWhitelisted(guildId: string, ownerId: string, userId: string): boolean {
  if (!userId) return false;
  if (userId === ownerId) return true;
  const row = db
    .query("SELECT 1 FROM protect_whitelist WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as { "1": number } | null;
  return row !== null;
}

/** true si l'utilisateur est exempté de l'anti-raid (le bot lui-même ou whitelisté). */
export function isAntiraidExempt(guildId: string, ownerId: string, botId: string, userId: string): boolean {
  if (!userId) return true;
  if (userId === botId) return true;
  return isWhitelisted(guildId, ownerId, userId);
}

/** Dernier message supprimé d'un salon (JSON : { content, author: { username, avatar, id }, date }). */
export function saveSnipe(guildId: string, channelId: string, json: string): void {
  db.query(
    "INSERT INTO protect_snipes (guild_id, channel_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at",
  ).run(guildId, channelId, json, Date.now());
}

export function getSnipe(guildId: string, channelId: string): string | null {
  const row = db
    .query("SELECT data FROM protect_snipes WHERE guild_id = ? AND channel_id = ?")
    .get(guildId, channelId) as { data: string } | null;
  return row?.data ?? null;
}

export function addTempban(guildId: string, userId: string, unbanAt: number): void {
  db.query(
    "INSERT INTO protect_tempbans (guild_id, user_id, unban_at) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET unban_at = excluded.unban_at",
  ).run(guildId, userId, unbanAt);
}

export function dueTempbans(now: number): Array<{ guild_id: string; user_id: string }> {
  const rows = db.query("SELECT guild_id, user_id FROM protect_tempbans WHERE unban_at <= ?").all(now) as Array<{
    guild_id: string;
    user_id: string;
  }>;
  return rows;
}

export function clearTempban(guildId: string, userId: string): void {
  db.query("DELETE FROM protect_tempbans WHERE guild_id = ? AND user_id = ?").run(guildId, userId);
}
