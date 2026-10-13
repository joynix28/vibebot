import { db } from "../../../core/db.ts";

// Tables du module legacy pour la sélection "Gestion" (welcome, counter, sticky,
// rolemenu, poll, suggest, confess, report, modmail, afk, birthday).
// NOTE : le fichier func/db.ts appartient à un autre agent (giveaway/ticket/
// logs/invites) — ce fichier séparé évite tout conflit. Les tables créées ici
// sont celles du contrat, plus legacy_suggest et legacy_suggest_votes
// (config du salon de suggestions + votes pour/contre, persistance requise).

db.exec(`
  CREATE TABLE IF NOT EXISTS legacy_welcome (
    guild_id TEXT PRIMARY KEY,
    data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS legacy_counters (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    template TEXT NOT NULL,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_sticky (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    last_id TEXT,
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_rolemenus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    label TEXT NOT NULL,
    roles TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS legacy_polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    question TEXT NOT NULL,
    options TEXT NOT NULL DEFAULT '[]',
    ends_at INTEGER,
    closed INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS legacy_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE TABLE IF NOT EXISTS legacy_suggest (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy_suggest_votes (
    suggestion_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    vote TEXT NOT NULL,
    PRIMARY KEY (suggestion_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_confess (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy_modmail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    channel_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS legacy_modmail_config (
    guild_id TEXT PRIMARY KEY,
    category_id TEXT,
    log_channel TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy_afk (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT 'AFK',
    since INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    announced_year INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
`);

/* ---------------- welcome ---------------- */

export interface WelcomeConfig {
  channelId?: string;
  join?: string;
  leave?: string;
  embed?: boolean;
}

export function getWelcome(guildId: string): WelcomeConfig | null {
  const row = db
    .query("SELECT data FROM legacy_welcome WHERE guild_id = ?")
    .get(guildId) as { data: string } | null;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as WelcomeConfig;
  } catch {
    return {};
  }
}

export function setWelcome(guildId: string, cfg: WelcomeConfig): void {
  db.run(
    "INSERT INTO legacy_welcome (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data",
    [guildId, JSON.stringify(cfg)]
  );
}

export function clearWelcome(guildId: string): void {
  db.run("DELETE FROM legacy_welcome WHERE guild_id = ?", [guildId]);
}

/* ---------------- counters ---------------- */

export interface CounterRow {
  guild_id: string;
  channel_id: string;
  kind: string;
  template: string;
}

export function addCounter(guildId: string, channelId: string, kind: string, template: string): void {
  db.run(
    "INSERT INTO legacy_counters (guild_id, channel_id, kind, template) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET kind = excluded.kind, template = excluded.template",
    [guildId, channelId, kind, template]
  );
}

export function removeCounter(guildId: string, channelId: string): boolean {
  const res = db.run("DELETE FROM legacy_counters WHERE guild_id = ? AND channel_id = ?", [guildId, channelId]);
  return res.changes > 0;
}

export function listCounters(guildId: string): CounterRow[] {
  return db
    .query("SELECT guild_id, channel_id, kind, template FROM legacy_counters WHERE guild_id = ?")
    .all(guildId) as CounterRow[];
}

export function allCounters(): CounterRow[] {
  return db.query("SELECT guild_id, channel_id, kind, template FROM legacy_counters").all() as CounterRow[];
}

/* ---------------- sticky ---------------- */

export interface StickyRow {
  guild_id: string;
  channel_id: string;
  message: string;
  last_id: string | null;
}

export function setSticky(guildId: string, channelId: string, message: string, lastId: string | null): void {
  db.run(
    "INSERT INTO legacy_sticky (guild_id, channel_id, message, last_id) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, channel_id) DO UPDATE SET message = excluded.message, last_id = excluded.last_id",
    [guildId, channelId, message, lastId]
  );
}

export function getSticky(guildId: string, channelId: string): StickyRow | null {
  return db
    .query("SELECT guild_id, channel_id, message, last_id FROM legacy_sticky WHERE guild_id = ? AND channel_id = ?")
    .get(guildId, channelId) as StickyRow | null;
}

export function removeSticky(guildId: string, channelId: string): boolean {
  const res = db.run("DELETE FROM legacy_sticky WHERE guild_id = ? AND channel_id = ?", [guildId, channelId]);
  return res.changes > 0;
}

export function setStickyLastId(guildId: string, channelId: string, lastId: string): void {
  db.run("UPDATE legacy_sticky SET last_id = ? WHERE guild_id = ? AND channel_id = ?", [lastId, guildId, channelId]);
}

/* ---------------- rolemenus ---------------- */

export interface RolemenuRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  label: string;
  roles: string[];
}

function toRolemenu(r: Omit<RolemenuRow, "roles"> & { roles: string }): RolemenuRow {
  let roles: string[] = [];
  try {
    const parsed: unknown = JSON.parse(r.roles);
    if (Array.isArray(parsed)) roles = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* ignore */
  }
  return { ...r, roles };
}

export function createRolemenu(guildId: string, channelId: string, label: string, roles: string[]): number {
  const res = db.run("INSERT INTO legacy_rolemenus (guild_id, channel_id, label, roles) VALUES (?, ?, ?, ?)", [
    guildId,
    channelId,
    label,
    JSON.stringify(roles),
  ]);
  return Number(res.lastInsertRowid);
}

export function getRolemenu(id: number): RolemenuRow | null {
  const row = db
    .query("SELECT id, guild_id, channel_id, message_id, label, roles FROM legacy_rolemenus WHERE id = ?")
    .get(id) as (Omit<RolemenuRow, "roles"> & { roles: string }) | null;
  return row ? toRolemenu(row) : null;
}

export function setRolemenuMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy_rolemenus SET message_id = ? WHERE id = ?", [messageId, id]);
}

export function deleteRolemenu(guildId: string, id: number): boolean {
  const res = db.run("DELETE FROM legacy_rolemenus WHERE id = ? AND guild_id = ?", [id, guildId]);
  return res.changes > 0;
}

export function listRolemenus(guildId: string): RolemenuRow[] {
  const rows = db
    .query("SELECT id, guild_id, channel_id, message_id, label, roles FROM legacy_rolemenus WHERE guild_id = ?")
    .all(guildId) as (Omit<RolemenuRow, "roles"> & { roles: string })[];
  return rows.map(toRolemenu);
}

/* ---------------- polls ---------------- */

export interface PollOption {
  label: string;
  votes: string[];
}

export interface PollRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  question: string;
  options: PollOption[];
  ends_at: number | null;
  closed: number;
  created_by: string;
}

function toPoll(r: Omit<PollRow, "options"> & { options: string }): PollRow {
  let options: PollOption[] = [];
  try {
    const parsed: unknown = JSON.parse(r.options);
    if (Array.isArray(parsed)) {
      options = parsed
        .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
        .map((o) => ({
          label: typeof o["label"] === "string" ? (o["label"] as string) : "",
          votes: Array.isArray(o["votes"])
            ? (o["votes"] as unknown[]).filter((v): v is string => typeof v === "string")
            : [],
        }));
    }
  } catch {
    /* ignore */
  }
  return { ...r, options };
}

export function createPoll(
  guildId: string,
  channelId: string,
  question: string,
  labels: string[],
  endsAt: number | null,
  createdBy: string
): number {
  const options: PollOption[] = labels.map((label) => ({ label, votes: [] }));
  const res = db.run(
    "INSERT INTO legacy_polls (guild_id, channel_id, question, options, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [guildId, channelId, question, JSON.stringify(options), endsAt, createdBy]
  );
  return Number(res.lastInsertRowid);
}

export function getPoll(id: number): PollRow | null {
  const row = db
    .query(
      "SELECT id, guild_id, channel_id, message_id, question, options, ends_at, closed, created_by FROM legacy_polls WHERE id = ?"
    )
    .get(id) as (Omit<PollRow, "options"> & { options: string }) | null;
  return row ? toPoll(row) : null;
}

export function setPollMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy_polls SET message_id = ? WHERE id = ?", [messageId, id]);
}

export function savePollOptions(id: number, options: PollOption[]): void {
  db.run("UPDATE legacy_polls SET options = ? WHERE id = ?", [JSON.stringify(options), id]);
}

export function closePoll(id: number): void {
  db.run("UPDATE legacy_polls SET closed = 1 WHERE id = ?", [id]);
}

export function listExpiredPolls(now: number): PollRow[] {
  const rows = db
    .query(
      "SELECT id, guild_id, channel_id, message_id, question, options, ends_at, closed, created_by FROM legacy_polls WHERE closed = 0 AND ends_at IS NOT NULL AND ends_at <= ?"
    )
    .all(now) as (Omit<PollRow, "options"> & { options: string })[];
  return rows.map(toPoll);
}

/* ---------------- suggestions ---------------- */

export interface SuggestionRow {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  author_id: string;
  content: string;
  status: string;
}

export function createSuggestion(guildId: string, channelId: string, authorId: string, content: string): number {
  const res = db.run("INSERT INTO legacy_suggestions (guild_id, channel_id, author_id, content) VALUES (?, ?, ?, ?)", [
    guildId,
    channelId,
    authorId,
    content,
  ]);
  return Number(res.lastInsertRowid);
}

export function getSuggestion(id: number): SuggestionRow | null {
  return db
    .query("SELECT id, guild_id, channel_id, message_id, author_id, content, status FROM legacy_suggestions WHERE id = ?")
    .get(id) as SuggestionRow | null;
}

export function setSuggestionMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy_suggestions SET message_id = ? WHERE id = ?", [messageId, id]);
}

export function setSuggestionStatus(id: number, status: string): void {
  db.run("UPDATE legacy_suggestions SET status = ? WHERE id = ?", [status, id]);
}

export function getSuggestChannel(guildId: string): string | null {
  const row = db.query("SELECT channel_id FROM legacy_suggest WHERE guild_id = ?").get(guildId) as {
    channel_id: string | null;
  } | null;
  return row?.channel_id ?? null;
}

export function setSuggestChannel(guildId: string, channelId: string): void {
  db.run(
    "INSERT INTO legacy_suggest (guild_id, channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id",
    [guildId, channelId]
  );
}

export function setSuggestVote(suggestionId: number, userId: string, vote: "up" | "down"): void {
  db.run(
    "INSERT INTO legacy_suggest_votes (suggestion_id, user_id, vote) VALUES (?, ?, ?) ON CONFLICT(suggestion_id, user_id) DO UPDATE SET vote = excluded.vote",
    [suggestionId, userId, vote]
  );
}

export function getSuggestVotes(suggestionId: number): { up: number; down: number } {
  const rows = db
    .query("SELECT vote, COUNT(*) AS n FROM legacy_suggest_votes WHERE suggestion_id = ? GROUP BY vote")
    .all(suggestionId) as { vote: string; n: number }[];
  let up = 0;
  let down = 0;
  for (const r of rows) {
    if (r.vote === "up") up = r.n;
    else if (r.vote === "down") down = r.n;
  }
  return { up, down };
}

/* ---------------- confess ---------------- */

export function getConfessChannel(guildId: string): string | null {
  const row = db.query("SELECT channel_id FROM legacy_confess WHERE guild_id = ?").get(guildId) as {
    channel_id: string | null;
  } | null;
  return row?.channel_id ?? null;
}

export function setConfessChannel(guildId: string, channelId: string | null): void {
  db.run(
    "INSERT INTO legacy_confess (guild_id, channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id",
    [guildId, channelId]
  );
}

/* ---------------- modmail ---------------- */

export interface ModmailTicket {
  id: number;
  guild_id: string;
  user_id: string;
  channel_id: string | null;
  status: string;
  created_at: number;
}

export interface ModmailConfig {
  category_id: string | null;
  log_channel: string | null;
}

export function createTicket(guildId: string, userId: string): number {
  const res = db.run("INSERT INTO legacy_modmail (guild_id, user_id, created_at) VALUES (?, ?, ?)", [
    guildId,
    userId,
    Date.now(),
  ]);
  return Number(res.lastInsertRowid);
}

export function getOpenTicket(guildId: string, userId: string): ModmailTicket | null {
  return db
    .query(
      "SELECT id, guild_id, user_id, channel_id, status, created_at FROM legacy_modmail WHERE guild_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1"
    )
    .get(guildId, userId) as ModmailTicket | null;
}

export function getTicketByChannel(channelId: string): ModmailTicket | null {
  return db
    .query(
      "SELECT id, guild_id, user_id, channel_id, status, created_at FROM legacy_modmail WHERE channel_id = ? AND status = 'open' LIMIT 1"
    )
    .get(channelId) as ModmailTicket | null;
}

export function setTicketChannel(id: number, channelId: string): void {
  db.run("UPDATE legacy_modmail SET channel_id = ? WHERE id = ?", [channelId, id]);
}

export function closeTicket(id: number): void {
  db.run("UPDATE legacy_modmail SET status = 'closed' WHERE id = ?", [id]);
}

export function listOpenTickets(guildId: string): ModmailTicket[] {
  return db
    .query(
      "SELECT id, guild_id, user_id, channel_id, status, created_at FROM legacy_modmail WHERE guild_id = ? AND status = 'open' ORDER BY id DESC"
    )
    .all(guildId) as ModmailTicket[];
}

export function getModmailConfig(guildId: string): ModmailConfig {
  const row = db.query("SELECT category_id, log_channel FROM legacy_modmail_config WHERE guild_id = ?").get(guildId) as ModmailConfig | null;
  return row ?? { category_id: null, log_channel: null };
}

export function setModmailConfig(guildId: string, patch: Partial<ModmailConfig>): void {
  const cur = getModmailConfig(guildId);
  const next: ModmailConfig = {
    category_id: patch.category_id !== undefined ? patch.category_id : cur.category_id,
    log_channel: patch.log_channel !== undefined ? patch.log_channel : cur.log_channel,
  };
  db.run(
    "INSERT INTO legacy_modmail_config (guild_id, category_id, log_channel) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET category_id = excluded.category_id, log_channel = excluded.log_channel",
    [guildId, next.category_id, next.log_channel]
  );
}

export function listModmailGuilds(): string[] {
  return db
    .query("SELECT guild_id FROM legacy_modmail_config WHERE category_id IS NOT NULL")
    .all()
    .map((r) => (r as { guild_id: string }).guild_id);
}

/* ---------------- afk ---------------- */

export interface AfkRow {
  guild_id: string;
  user_id: string;
  reason: string;
  since: number;
}

export function setAfk(guildId: string, userId: string, reason: string): void {
  db.run(
    "INSERT INTO legacy_afk (guild_id, user_id, reason, since) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, since = excluded.since",
    [guildId, userId, reason, Date.now()]
  );
}

export function removeAfk(guildId: string, userId: string): boolean {
  const res = db.run("DELETE FROM legacy_afk WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return res.changes > 0;
}

export function getAfk(guildId: string, userId: string): AfkRow | null {
  return db
    .query("SELECT guild_id, user_id, reason, since FROM legacy_afk WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as AfkRow | null;
}

/* ---------------- birthdays ---------------- */

export interface BirthdayRow {
  guild_id: string;
  user_id: string;
  month: number;
  day: number;
  announced_year: number;
}

export function setBirthday(guildId: string, userId: string, month: number, day: number): void {
  db.run(
    "INSERT INTO legacy_birthdays (guild_id, user_id, month, day) VALUES (?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET month = excluded.month, day = excluded.day",
    [guildId, userId, month, day]
  );
}

export function removeBirthday(guildId: string, userId: string): boolean {
  const res = db.run("DELETE FROM legacy_birthdays WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
  return res.changes > 0;
}

export function getBirthday(guildId: string, userId: string): BirthdayRow | null {
  return db
    .query("SELECT guild_id, user_id, month, day, announced_year FROM legacy_birthdays WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as BirthdayRow | null;
}

export function listBirthdays(guildId: string): BirthdayRow[] {
  return db
    .query("SELECT guild_id, user_id, month, day, announced_year FROM legacy_birthdays WHERE guild_id = ?")
    .all(guildId) as BirthdayRow[];
}

export function markBirthdayAnnounced(guildId: string, userId: string, year: number): void {
  db.run("UPDATE legacy_birthdays SET announced_year = ? WHERE guild_id = ? AND user_id = ?", [year, guildId, userId]);
}

export function listGuildsWithBirthdays(): string[] {
  return db
    .query("SELECT DISTINCT guild_id FROM legacy_birthdays")
    .all()
    .map((r) => (r as { guild_id: string }).guild_id);
}

/* ---------------- reports ---------------- */

export interface ReportRow {
  id: number;
  guild_id: string;
  reporter_id: string;
  target_id: string;
  reason: string;
  status: string;
  created_at: number;
}

export function createReport(guildId: string, reporterId: string, targetId: string, reason: string): number {
  const res = db.run("INSERT INTO legacy_reports (guild_id, reporter_id, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", [
    guildId,
    reporterId,
    targetId,
    reason,
    Date.now(),
  ]);
  return Number(res.lastInsertRowid);
}

export function setReportStatus(id: number, status: string): void {
  db.run("UPDATE legacy_reports SET status = ? WHERE id = ?", [status, id]);
}

export function listOpenReports(guildId: string): ReportRow[] {
  return db
    .query(
      "SELECT id, guild_id, reporter_id, target_id, reason, status, created_at FROM legacy_reports WHERE guild_id = ? AND status = 'open' ORDER BY id DESC"
    )
    .all(guildId) as ReportRow[];
}
