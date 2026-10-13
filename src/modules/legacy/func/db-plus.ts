import { db } from "../../../core/db.ts";

// Tables complémentaires du module legacy (candidatures, prison, pub, messages
// récurrents). Tout est préfixé `legacy2_` pour ne pas entrer en collision
// avec les tables existantes.

db.exec(`
  CREATE TABLE IF NOT EXISTS legacy2_recruitments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    title TEXT NOT NULL,
    questions TEXT NOT NULL DEFAULT '[]',
    open INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS legacy2_applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recruitment_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    answers TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'pending',
    staff_message_id TEXT,
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS legacy2_recruit_config (
    guild_id TEXT PRIMARY KEY,
    staff_channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy2_jail_config (
    guild_id TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    channel_id TEXT
  );
  CREATE TABLE IF NOT EXISTS legacy2_jail (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    roles_json TEXT NOT NULL DEFAULT '[]',
    reason TEXT,
    jailed_by TEXT NOT NULL,
    jailed_at INTEGER NOT NULL,
    ends_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy2_pub_config (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS legacy2_pub_stats (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    last_at INTEGER,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS legacy2_recurrent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    interval_min INTEGER NOT NULL,
    message TEXT NOT NULL,
    last_sent INTEGER,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
  );
`);

// ---------------------------------------------------------------------------
// Candidatures
// ---------------------------------------------------------------------------

export interface Recruitment {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  questions: string[];
  open: number;
  created_by: string;
  created_at: number;
}

interface RecruitmentRow extends Omit<Recruitment, "questions"> {
  questions: string;
}

function mapRecruitment(row: RecruitmentRow): Recruitment {
  let questions: string[] = [];
  try {
    questions = JSON.parse(row.questions) as string[];
  } catch {
    questions = [];
  }
  return { ...row, questions };
}

export function createRecruitment(r: {
  guildId: string;
  channelId: string;
  title: string;
  questions: string[];
  createdBy: string;
}): Recruitment {
  db.run(
    "INSERT INTO legacy2_recruitments (guild_id, channel_id, title, questions, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [r.guildId, r.channelId, r.title, JSON.stringify(r.questions), r.createdBy, Date.now()]
  );
  const row = db
    .query("SELECT * FROM legacy2_recruitments WHERE rowid = last_insert_rowid()")
    .get() as RecruitmentRow | null;
  if (!row) throw new Error("Création du recrutement impossible.");
  return mapRecruitment(row);
}

export function getRecruitment(id: number): Recruitment | null {
  const row = db.query("SELECT * FROM legacy2_recruitments WHERE id = ?").get(id) as RecruitmentRow | null;
  return row ? mapRecruitment(row) : null;
}

export function listRecruitments(guildId: string): Recruitment[] {
  return (
    db.query("SELECT * FROM legacy2_recruitments WHERE guild_id = ? ORDER BY id DESC LIMIT 25").all(guildId) as RecruitmentRow[]
  ).map(mapRecruitment);
}

export function setRecruitmentMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy2_recruitments SET message_id = ? WHERE id = ?", [messageId, id]);
}

export function closeRecruitment(id: number): void {
  db.run("UPDATE legacy2_recruitments SET open = 0 WHERE id = ?", [id]);
}

export function deleteRecruitment(id: number): void {
  db.run("DELETE FROM legacy2_applications WHERE recruitment_id = ?", [id]);
  db.run("DELETE FROM legacy2_recruitments WHERE id = ?", [id]);
}

export interface Application {
  id: number;
  recruitment_id: number;
  guild_id: string;
  user_id: string;
  answers: Record<string, string>;
  status: "pending" | "accepted" | "refused";
  staff_message_id: string | null;
  created_at: number;
  decided_at: number | null;
}

interface ApplicationRow extends Omit<Application, "answers" | "status"> {
  answers: string;
  status: string;
}

function mapApplication(row: ApplicationRow): Application {
  let answers: Record<string, string> = {};
  try {
    answers = JSON.parse(row.answers) as Record<string, string>;
  } catch {
    answers = {};
  }
  const status = row.status === "accepted" || row.status === "refused" ? row.status : "pending";
  return { ...row, answers, status };
}

export function addApplication(
  recruitmentId: number,
  guildId: string,
  userId: string,
  answers: Record<string, string>
): Application {
  db.run(
    "INSERT INTO legacy2_applications (recruitment_id, guild_id, user_id, answers, created_at) VALUES (?, ?, ?, ?, ?)",
    [recruitmentId, guildId, userId, JSON.stringify(answers), Date.now()]
  );
  const row = db
    .query("SELECT * FROM legacy2_applications WHERE rowid = last_insert_rowid()")
    .get() as ApplicationRow | null;
  if (!row) throw new Error("Enregistrement de la candidature impossible.");
  return mapApplication(row);
}

/** Candidature en attente d'un utilisateur pour un recrutement (anti-doublon). */
export function getPendingApplication(recruitmentId: number, userId: string): Application | null {
  const row = db
    .query(
      "SELECT * FROM legacy2_applications WHERE recruitment_id = ? AND user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"
    )
    .get(recruitmentId, userId) as ApplicationRow | null;
  return row ? mapApplication(row) : null;
}

export function getApplication(id: number): Application | null {
  const row = db.query("SELECT * FROM legacy2_applications WHERE id = ?").get(id) as ApplicationRow | null;
  return row ? mapApplication(row) : null;
}

export function listApplications(recruitmentId: number): Application[] {
  return (
    db.query("SELECT * FROM legacy2_applications WHERE recruitment_id = ? ORDER BY id DESC LIMIT 50").all(recruitmentId) as ApplicationRow[]
  ).map(mapApplication);
}

export function countApplications(recruitmentId: number): number {
  const row = db
    .query("SELECT COUNT(*) AS n FROM legacy2_applications WHERE recruitment_id = ?")
    .get(recruitmentId) as { n: number };
  return row.n;
}

export function setApplicationStatus(id: number, status: "accepted" | "refused"): void {
  db.run("UPDATE legacy2_applications SET status = ?, decided_at = ? WHERE id = ?", [status, Date.now(), id]);
}

export function setApplicationStaffMessage(id: number, messageId: string): void {
  db.run("UPDATE legacy2_applications SET staff_message_id = ? WHERE id = ?", [messageId, id]);
}

export function getRecruitStaffChannel(guildId: string): string | null {
  const row = db
    .query("SELECT staff_channel_id FROM legacy2_recruit_config WHERE guild_id = ?")
    .get(guildId) as { staff_channel_id: string | null } | null;
  return row?.staff_channel_id ?? null;
}

export function setRecruitStaffChannel(guildId: string, channelId: string): void {
  db.run(
    "INSERT INTO legacy2_recruit_config (guild_id, staff_channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET staff_channel_id = excluded.staff_channel_id",
    [guildId, channelId]
  );
}

// ---------------------------------------------------------------------------
// Prison
// ---------------------------------------------------------------------------

export interface JailConfig {
  guild_id: string;
  role_id: string;
  channel_id: string | null;
}

export function getJailConfig(guildId: string): JailConfig | null {
  return (
    (db.query("SELECT * FROM legacy2_jail_config WHERE guild_id = ?").get(guildId) as JailConfig | null) ?? null
  );
}

export function setJailConfig(guildId: string, roleId: string, channelId: string | null): void {
  db.run(
    "INSERT INTO legacy2_jail_config (guild_id, role_id, channel_id) VALUES (?, ?, ?) ON CONFLICT(guild_id) DO UPDATE SET role_id = excluded.role_id, channel_id = excluded.channel_id",
    [guildId, roleId, channelId]
  );
}

export interface JailRow {
  guild_id: string;
  user_id: string;
  roles_json: string;
  reason: string | null;
  jailed_by: string;
  jailed_at: number;
  ends_at: number | null;
}

export function jailUser(j: {
  guildId: string;
  userId: string;
  roles: string[];
  reason: string | null;
  jailedBy: string;
  endsAt: number | null;
}): void {
  db.run(
    "INSERT INTO legacy2_jail (guild_id, user_id, roles_json, reason, jailed_by, jailed_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET roles_json = excluded.roles_json, reason = excluded.reason, jailed_by = excluded.jailed_by, jailed_at = excluded.jailed_at, ends_at = excluded.ends_at",
    [j.guildId, j.userId, JSON.stringify(j.roles), j.reason, j.jailedBy, Date.now(), j.endsAt]
  );
}

export function getJailed(guildId: string, userId: string): JailRow | null {
  return (
    (db.query("SELECT * FROM legacy2_jail WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as JailRow | null) ?? null
  );
}

export function listJailed(guildId: string): JailRow[] {
  return db.query("SELECT * FROM legacy2_jail WHERE guild_id = ? ORDER BY jailed_at DESC").all(guildId) as JailRow[];
}

/** Lignes dont la peine est terminée (restauration au boot / sweep périodique). */
export function dueJails(now: number): JailRow[] {
  return db.query("SELECT * FROM legacy2_jail WHERE ends_at IS NOT NULL AND ends_at <= ?").all(now) as JailRow[];
}

export function releaseUser(guildId: string, userId: string): void {
  db.run("DELETE FROM legacy2_jail WHERE guild_id = ? AND user_id = ?", [guildId, userId]);
}

// ---------------------------------------------------------------------------
// Pub / partenariats
// ---------------------------------------------------------------------------

export function getPubChannel(guildId: string): string | null {
  const row = db
    .query("SELECT channel_id FROM legacy2_pub_config WHERE guild_id = ?")
    .get(guildId) as { channel_id: string } | null;
  return row?.channel_id ?? null;
}

export function setPubChannel(guildId: string, channelId: string): void {
  db.run(
    "INSERT INTO legacy2_pub_config (guild_id, channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id",
    [guildId, channelId]
  );
}

export interface PubStat {
  guild_id: string;
  user_id: string;
  count: number;
  last_at: number | null;
}

/** Incrémente le compteur de pubs d'un membre, retourne le nouveau total. */
export function recordPubPost(guildId: string, userId: string): number {
  db.run(
    "INSERT INTO legacy2_pub_stats (guild_id, user_id, count, last_at) VALUES (?, ?, 1, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET count = legacy2_pub_stats.count + 1, last_at = excluded.last_at",
    [guildId, userId, Date.now()]
  );
  const row = db
    .query("SELECT count FROM legacy2_pub_stats WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as { count: number };
  return row.count;
}

export function getPubCount(guildId: string, userId: string): number {
  const row = db
    .query("SELECT count FROM legacy2_pub_stats WHERE guild_id = ? AND user_id = ?")
    .get(guildId, userId) as { count: number } | null;
  return row?.count ?? 0;
}

export function topPub(guildId: string, limit = 10): PubStat[] {
  return db
    .query("SELECT * FROM legacy2_pub_stats WHERE guild_id = ? ORDER BY count DESC LIMIT ?")
    .all(guildId, limit) as PubStat[];
}

/** Rang (1-based) d'un membre au classement des pubs. */
export function pubRank(guildId: string, userId: string): number {
  const row = db
    .query(
      "SELECT (SELECT COUNT(*) FROM legacy2_pub_stats WHERE guild_id = ? AND count > t.count) + 1 AS rank FROM legacy2_pub_stats t WHERE guild_id = ? AND user_id = ?"
    )
    .get(guildId, guildId, userId) as { rank: number } | null;
  return row?.rank ?? 0;
}

// ---------------------------------------------------------------------------
// Messages récurrents
// ---------------------------------------------------------------------------

export interface RecurrentRow {
  id: number;
  guild_id: string;
  channel_id: string;
  interval_min: number;
  message: string;
  last_sent: number | null;
  created_by: string;
  created_at: number;
  enabled: number;
}

export function addRecurrent(r: {
  guildId: string;
  channelId: string;
  intervalMin: number;
  message: string;
  createdBy: string;
}): RecurrentRow {
  db.run(
    "INSERT INTO legacy2_recurrent (guild_id, channel_id, interval_min, message, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [r.guildId, r.channelId, r.intervalMin, r.message, r.createdBy, Date.now()]
  );
  const row = db
    .query("SELECT * FROM legacy2_recurrent WHERE rowid = last_insert_rowid()")
    .get() as RecurrentRow | null;
  if (!row) throw new Error("Création du message récurrent impossible.");
  return row;
}

export function getRecurrent(id: number): RecurrentRow | null {
  return (
    (db.query("SELECT * FROM legacy2_recurrent WHERE id = ?").get(id) as RecurrentRow | null) ?? null
  );
}

export function listRecurrents(guildId: string): RecurrentRow[] {
  return db.query("SELECT * FROM legacy2_recurrent WHERE guild_id = ? ORDER BY id ASC").all(guildId) as RecurrentRow[];
}

/** Tous les messages récurrents actifs (restauration au boot). */
export function listAllRecurrents(): RecurrentRow[] {
  return db.query("SELECT * FROM legacy2_recurrent WHERE enabled = 1").all() as RecurrentRow[];
}

export function deleteRecurrent(id: number): void {
  db.run("DELETE FROM legacy2_recurrent WHERE id = ?", [id]);
}

export function setRecurrentLastSent(id: number, ts: number): void {
  db.run("UPDATE legacy2_recurrent SET last_sent = ? WHERE id = ?", [ts, id]);
}
