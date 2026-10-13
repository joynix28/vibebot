import { db } from "../../../core/db.ts";
import { levelFromXp } from "./xp.ts";

// Tables du module legacy (migration de la DB JSON par serveur du bot d'origine
// vers SQLite). Tout est préfixé `legacy_*` pour ne pas entrer en collision
// avec les tables des autres agents/modules.

db.exec(`
  CREATE TABLE IF NOT EXISTS legacy_giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    prize TEXT NOT NULL,
    winners_count INTEGER NOT NULL DEFAULT 1,
    ends_at INTEGER NOT NULL,
    ended INTEGER NOT NULL DEFAULT 0,
    ended_at INTEGER,
    created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS legacy_give_entries (
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_xp (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS legacy_ticket_config (
    guild_id TEXT PRIMARY KEY,
    category_id TEXT,
    log_channel TEXT,
    support_role TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy_logs (
    guild_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS legacy_invites (
    guild_id TEXT NOT NULL,
    inviter_id TEXT NOT NULL,
    invited_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    left_flag INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, invited_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_invite_config (
    guild_id TEXT PRIMARY KEY,
    join_message TEXT,
    leave_message TEXT,
    join_channel TEXT,
    leave_channel TEXT,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`);

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------

export interface Giveaway {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  prize: string;
  winners_count: number;
  ends_at: number;
  ended: number;
  ended_at: number | null;
  created_by: string;
}

export function createGiveaway(g: {
  guildId: string;
  channelId: string;
  prize: string;
  winnersCount: number;
  endsAt: number;
  createdBy: string;
}): Giveaway {
  db.run(
    "INSERT INTO legacy_giveaways (guild_id, channel_id, prize, winners_count, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [g.guildId, g.channelId, g.prize, g.winnersCount, g.endsAt, g.createdBy]
  );
  const row = db
    .query("SELECT * FROM legacy_giveaways WHERE rowid = last_insert_rowid()")
    .get() as Giveaway | null;
  if (!row) throw new Error("Création du giveaway impossible.");
  return row;
}

export function getGiveaway(id: number): Giveaway | null {
  return (db.query("SELECT * FROM legacy_giveaways WHERE id = ?").get(id) as Giveaway | null) ?? null;
}

export function setGiveawayMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy_giveaways SET message_id = ? WHERE id = ?", [messageId, id]);
}

export function endGiveaway(id: number): void {
  db.run("UPDATE legacy_giveaways SET ended = 1, ended_at = ? WHERE id = ?", [Date.now(), id]);
}

export function listGiveaways(guildId: string, onlyActive = false): Giveaway[] {
  const q = onlyActive
    ? "SELECT * FROM legacy_giveaways WHERE guild_id = ? AND ended = 0 ORDER BY ends_at ASC"
    : "SELECT * FROM legacy_giveaways WHERE guild_id = ? ORDER BY ends_at DESC LIMIT 25";
  return db.query(q).all(guildId) as Giveaway[];
}

/** Giveaways arrivés à échéance et pas encore tirés (utilisé par le scheduler). */
export function dueGiveaways(now: number): Giveaway[] {
  return db.query("SELECT * FROM legacy_giveaways WHERE ended = 0 AND ends_at <= ?").all(now) as Giveaway[];
}

export function addEntry(giveawayId: number, userId: string): boolean {
  try {
    db.run("INSERT INTO legacy_give_entries (giveaway_id, user_id) VALUES (?, ?)", [giveawayId, userId]);
    return true;
  } catch {
    return false; // déjà inscrit
  }
}

export function hasEntry(giveawayId: number, userId: string): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM legacy_give_entries WHERE giveaway_id = ? AND user_id = ?")
    .get(giveawayId, userId) as { ok: number } | null;
  return row !== null;
}

export function getEntries(giveawayId: number): string[] {
  return (
    db.query("SELECT user_id FROM legacy_give_entries WHERE giveaway_id = ?").all(giveawayId) as {
      user_id: string;
    }[]
  ).map((r) => r.user_id);
}

export function entryCount(giveawayId: number): number {
  const row = db
    .query("SELECT COUNT(*) AS n FROM legacy_give_entries WHERE giveaway_id = ?")
    .get(giveawayId) as { n: number };
  return row.n;
}

// ---------------------------------------------------------------------------
// XP / niveaux
// ---------------------------------------------------------------------------

export interface XpRow {
  guild_id: string;
  user_id: string;
  xp: number;
  level: number;
}

export function getXp(guildId: string, userId: string): XpRow {
  const row = db
    .query("SELECT * FROM legacy_xp WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as XpRow | null;
  return row ?? { guild_id: guildId, user_id: userId, xp: 0, level: 0 };
}

/** Applique un delta d'XP (peut être négatif, floor à 0) et retourne la ligne à jour. */
export function addXp(guildId: string, userId: string, delta: number): XpRow {
  const cur = getXp(guildId, userId);
  const xp = Math.max(0, cur.xp + delta);
  const level = levelFromXp(xp);
  db.run(
    "INSERT INTO legacy_xp (guild_id, user_id, xp, level) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level",
    [guildId, userId, xp, level]
  );
  return getXp(guildId, userId);
}

export function setXp(guildId: string, userId: string, xp: number): XpRow {
  return addXp(guildId, userId, Math.max(0, xp) - getXp(guildId, userId).xp);
}

export function topXp(guildId: string, limit = 10): XpRow[] {
  return db.query("SELECT * FROM legacy_xp WHERE guild_id = ? ORDER BY xp DESC LIMIT ?").all(guildId, limit) as XpRow[];
}

/** Rang (1-based) d'un utilisateur dans son serveur. */
export function rankOf(guildId: string, userId: string): number {
  const row = db
    .query(
      "SELECT (SELECT COUNT(*) FROM legacy_xp WHERE guild_id = ? AND xp > t.xp) + 1 AS rank FROM legacy_xp t WHERE guild_id = ? AND user_id = ?"
    )
    .get(guildId, guildId, userId) as { rank: number } | null;
  if (!row) {
    const count = (
      db.query("SELECT COUNT(*) AS n FROM legacy_xp WHERE guild_id = ?").get(guildId) as { n: number }
    ).n;
    return count + 1;
  }
  return row.rank;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface Ticket {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string | null;
  status: "open" | "closed";
  created_at: number;
  closed_at: number | null;
}

export function createTicket(guildId: string, userId: string): Ticket {
  db.run("INSERT INTO legacy_tickets (guild_id, user_id, created_at) VALUES (?, ?, ?)", [
    guildId,
    userId,
    Date.now(),
  ]);
  const row = db
    .query("SELECT * FROM legacy_tickets WHERE rowid = last_insert_rowid()")
    .get() as Ticket | null;
  if (!row) throw new Error("Création du ticket impossible.");
  return row;
}

export function getTicket(id: number): Ticket | null {
  return (db.query("SELECT * FROM legacy_tickets WHERE id = ?").get(id) as Ticket | null) ?? null;
}

export function getTicketByChannel(channelId: string): Ticket | null {
  return (
    (db.query("SELECT * FROM legacy_tickets WHERE channel_id = ? ORDER BY id DESC LIMIT 1").get(channelId) as Ticket | null) ?? null
  );
}

export function getOpenTicketByUser(guildId: string, userId: string): Ticket | null {
  return (
    (
      db
        .query("SELECT * FROM legacy_tickets WHERE guild_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
        .get(guildId, userId) as Ticket | null
    ) ?? null
  );
}

export function setTicketChannel(id: number, channelId: string): void {
  db.run("UPDATE legacy_tickets SET channel_id = ? WHERE id = ?", [channelId, id]);
}

export function closeTicket(id: number): void {
  db.run("UPDATE legacy_tickets SET status = 'closed', closed_at = ? WHERE id = ?", [Date.now(), id]);
}

export function deleteTicket(id: number): void {
  db.run("DELETE FROM legacy_tickets WHERE id = ?", [id]);
}

export interface TicketConfig {
  guild_id: string;
  category_id: string | null;
  log_channel: string | null;
  support_role: string | null;
}

export function getTicketConfig(guildId: string): TicketConfig {
  const row = db
    .query("SELECT * FROM legacy_ticket_config WHERE guild_id = ?")
    .get(guildId) as TicketConfig | null;
  return row ?? { guild_id: guildId, category_id: null, log_channel: null, support_role: null };
}

export function saveTicketConfig(cfg: TicketConfig): void {
  db.run(
    "INSERT INTO legacy_ticket_config (guild_id, category_id, log_channel, support_role) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET category_id = excluded.category_id, log_channel = excluded.log_channel, support_role = excluded.support_role",
    [cfg.guild_id, cfg.category_id, cfg.log_channel, cfg.support_role]
  );
}

// ---------------------------------------------------------------------------
// Logs (configuration, JSON libre par serveur)
// ---------------------------------------------------------------------------

export interface LogsConfig {
  moderation?: string | null;
  messages?: string | null;
  arrivees?: string | null;
  departs?: string | null;
  vocal?: string | null;
  salons?: string | null;
  roles?: string | null;
  [key: string]: string | null | undefined;
}

export function getLogsConfig(guildId: string): LogsConfig {
  const row = db.query("SELECT data FROM legacy_logs WHERE guild_id = ?").get(guildId) as {
    data: string;
  } | null;
  if (!row) return {};
  try {
    return JSON.parse(row.data) as LogsConfig;
  } catch {
    return {};
  }
}

export function saveLogsConfig(guildId: string, cfg: LogsConfig): void {
  db.run(
    "INSERT INTO legacy_logs (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data",
    [guildId, JSON.stringify(cfg)]
  );
}

export function setLogChannel(guildId: string, key: string, channelId: string | null): void {
  const cfg = getLogsConfig(guildId);
  cfg[key] = channelId;
  saveLogsConfig(guildId, cfg);
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

export interface InviteRecord {
  guild_id: string;
  inviter_id: string;
  invited_id: string;
  joined_at: number;
  left_flag: number;
}

export function recordInvite(guildId: string, inviterId: string, invitedId: string): void {
  db.run(
    "INSERT INTO legacy_invites (guild_id, inviter_id, invited_id, joined_at, left_flag) VALUES (?, ?, ?, ?, 0) ON CONFLICT(guild_id, invited_id) DO UPDATE SET inviter_id = excluded.inviter_id, joined_at = excluded.joined_at, left_flag = 0",
    [guildId, inviterId, invitedId, Date.now()]
  );
}

export function markLeft(guildId: string, invitedId: string): InviteRecord | null {
  const row = db
    .query("SELECT * FROM legacy_invites WHERE guild_id = ? AND invited_id = ?")
    .get(guildId, invitedId) as InviteRecord | null;
  if (!row) return null;
  db.run("UPDATE legacy_invites SET left_flag = 1 WHERE guild_id = ? AND invited_id = ?", [guildId, invitedId]);
  return row;
}

export interface InviteStats {
  total: number;
  joined: number;
  left: number;
}

/** Statistiques d'un invitant : total = joined - left. */
export function getInviteStats(guildId: string, inviterId: string): InviteStats {
  const row = db
    .query(
      "SELECT COUNT(*) AS joined, SUM(CASE WHEN left_flag = 1 THEN 1 ELSE 0 END) AS leftc FROM legacy_invites WHERE guild_id = ? AND inviter_id = ?"
    )
    .get(guildId, inviterId) as { joined: number; leftc: number | null };
  const joined = row.joined;
  const left = row.leftc ?? 0;
  return { total: joined - left, joined, left };
}

export interface InviteConfig {
  guild_id: string;
  join_message: string | null;
  leave_message: string | null;
  join_channel: string | null;
  leave_channel: string | null;
  enabled: number;
}

const DEFAULT_JOIN_MESSAGE =
  "👋 Bienvenue {user} sur **{server}** ! Tu es notre {count}e membre. Invité par {inviter}.";
const DEFAULT_LEAVE_MESSAGE = "👋 {user} a quitté **{server}**. Invité par {inviter}.";

export function getInviteConfig(guildId: string): InviteConfig {
  const row = db
    .query("SELECT * FROM legacy_invite_config WHERE guild_id = ?")
    .get(guildId) as InviteConfig | null;
  return row ?? { guild_id: guildId, join_message: null, leave_message: null, join_channel: null, leave_channel: null, enabled: 1 };
}

export function saveInviteConfig(cfg: InviteConfig): void {
  db.run(
    "INSERT INTO legacy_invite_config (guild_id, join_message, leave_message, join_channel, leave_channel, enabled) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET join_message = excluded.join_message, leave_message = excluded.leave_message, join_channel = excluded.join_channel, leave_channel = excluded.leave_channel, enabled = excluded.enabled",
    [cfg.guild_id, cfg.join_message, cfg.leave_message, cfg.join_channel, cfg.leave_channel, cfg.enabled]
  );
}

export function defaultJoinMessage(): string {
  return DEFAULT_JOIN_MESSAGE;
}

export function defaultLeaveMessage(): string {
  return DEFAULT_LEAVE_MESSAGE;
}

/** Applique les variables {user}, {server}, {count}, {inviter} à un template. */
export function applyInviteVars(
  template: string | null,
  fallback: string,
  vars: { user: string; server: string; count: number; inviter: string }
): string {
  const raw = template?.trim() ? template : fallback;
  return raw
    .replaceAll("{user}", vars.user)
    .replaceAll("{server}", vars.server)
    .replaceAll("{count}", String(vars.count))
    .replaceAll("{inviter}", vars.inviter);
}
