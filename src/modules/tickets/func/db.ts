import { db } from "../../../core/db.ts";

// Base de données du module tickets (système v2).
// Toutes les tables sont préfixées `tickets_*`.
// Toutes les requêtes sont 100% paramétrées (jamais d'interpolation).

db.exec(`
  CREATE TABLE IF NOT EXISTS tickets_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category_id TEXT,
    support_roles TEXT NOT NULL DEFAULT '[]',
    select_options TEXT NOT NULL DEFAULT '[]',
    style TEXT NOT NULL DEFAULT 'button',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_panels_guild ON tickets_panels (guild_id);

  CREATE TABLE IF NOT EXISTS tickets_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    creator_id TEXT NOT NULL,
    claimed_by TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normale',
    topic TEXT NOT NULL DEFAULT '',
    first_response_at INTEGER,
    created_at INTEGER NOT NULL,
    closed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_tickets_tickets_guild ON tickets_tickets (guild_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_tickets_channel ON tickets_tickets (channel_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_tickets_creator ON tickets_tickets (guild_id, creator_id);

  CREATE TABLE IF NOT EXISTS tickets_feedback (
    ticket_id INTEGER PRIMARY KEY,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets_log_channel (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT
  );
`);

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export type PanelStyle = "button" | "select";

export interface TicketPanel {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string;
  category_id: string | null;
  /** IDs des rôles support, encodés en JSON. */
  support_roles: string;
  /** Options du menu déroulant (style select), encodées en JSON. */
  select_options: string;
  style: PanelStyle;
  created_by: string;
  created_at: number;
}

export function createPanel(p: {
  guildId: string;
  channelId: string;
  title: string;
  description: string;
  categoryId: string | null;
  supportRoles: string[];
  selectOptions: string[];
  style: PanelStyle;
  createdBy: string;
}): TicketPanel {
  db.run(
    "INSERT INTO tickets_panels (guild_id, channel_id, title, description, category_id, support_roles, select_options, style, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [
      p.guildId,
      p.channelId,
      p.title,
      p.description,
      p.categoryId,
      JSON.stringify(p.supportRoles),
      JSON.stringify(p.selectOptions),
      p.style,
      p.createdBy,
      Date.now(),
    ]
  );
  const row = db.query("SELECT * FROM tickets_panels WHERE rowid = last_insert_rowid()").get() as TicketPanel | null;
  if (!row) throw new Error("Création du panel impossible.");
  return row;
}

export function getPanel(id: number): TicketPanel | null {
  return (db.query("SELECT * FROM tickets_panels WHERE id = ?").get(id) as TicketPanel | null) ?? null;
}

export function getPanelByMessage(messageId: string): TicketPanel | null {
  return (
    (db.query("SELECT * FROM tickets_panels WHERE message_id = ?").get(messageId) as TicketPanel | null) ?? null
  );
}

export function listPanels(guildId: string): TicketPanel[] {
  return db.query("SELECT * FROM tickets_panels WHERE guild_id = ? ORDER BY id ASC").all(guildId) as TicketPanel[];
}

export function deletePanel(id: number): void {
  db.run("DELETE FROM tickets_panels WHERE id = ?", [id]);
}

export function setPanelMessage(id: number, messageId: string): void {
  db.run("UPDATE tickets_panels SET message_id = ? WHERE id = ?", [messageId, id]);
}

/** Décode la liste des rôles support d'un panel (tableau d'IDs, jamais null). */
export function panelSupportRoles(panel: TicketPanel): string[] {
  try {
    const v = JSON.parse(panel.support_roles) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Décode les options du menu déroulant d'un panel. */
export function panelSelectOptions(panel: TicketPanel): string[] {
  try {
    const v = JSON.parse(panel.select_options) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Tous les IDs de rôles support configurés sur le serveur (tous panels confondus). */
export function allSupportRoles(guildId: string): string[] {
  const set = new Set<string>();
  for (const p of listPanels(guildId)) {
    for (const r of panelSupportRoles(p)) set.add(r);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type TicketStatus = "open" | "closed";
export type TicketPriority = "haute" | "normale" | "basse";

export interface Ticket {
  id: number;
  guild_id: string;
  channel_id: string | null;
  creator_id: string;
  claimed_by: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  topic: string;
  first_response_at: number | null;
  created_at: number;
  closed_at: number | null;
}

export function createTicket(guildId: string, creatorId: string, topic: string): Ticket {
  db.run("INSERT INTO tickets_tickets (guild_id, creator_id, topic, created_at) VALUES (?, ?, ?, ?)", [
    guildId,
    creatorId,
    topic,
    Date.now(),
  ]);
  const row = db.query("SELECT * FROM tickets_tickets WHERE rowid = last_insert_rowid()").get() as Ticket | null;
  if (!row) throw new Error("Création du ticket impossible.");
  return row;
}

export function getTicket(id: number): Ticket | null {
  return (db.query("SELECT * FROM tickets_tickets WHERE id = ?").get(id) as Ticket | null) ?? null;
}

export function getTicketByChannel(channelId: string): Ticket | null {
  return (
    (db.query("SELECT * FROM tickets_tickets WHERE channel_id = ? ORDER BY id DESC LIMIT 1").get(channelId) as Ticket | null) ?? null
  );
}

/** Ticket ouvert d'un utilisateur sur un serveur (limite : 1 à la fois). */
export function getOpenTicketByUser(guildId: string, userId: string): Ticket | null {
  return (
    (
      db
        .query("SELECT * FROM tickets_tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1")
        .get(guildId, userId) as Ticket | null
    ) ?? null
  );
}

export function setTicketChannel(id: number, channelId: string): void {
  db.run("UPDATE tickets_tickets SET channel_id = ? WHERE id = ?", [channelId, id]);
}

export function closeTicket(id: number): void {
  db.run("UPDATE tickets_tickets SET status = 'closed', closed_at = ? WHERE id = ?", [Date.now(), id]);
}

export function claimTicket(id: number, staffId: string): void {
  db.run("UPDATE tickets_tickets SET claimed_by = ? WHERE id = ?", [staffId, id]);
}

export function releaseTicket(id: number): void {
  db.run("UPDATE tickets_tickets SET claimed_by = NULL WHERE id = ?", [id]);
}

export function setTicketPriority(id: number, priority: TicketPriority): void {
  db.run("UPDATE tickets_tickets SET priority = ? WHERE id = ?", [priority, id]);
}

export function setTicketTopic(id: number, topic: string): void {
  db.run("UPDATE tickets_tickets SET topic = ? WHERE id = ?", [topic, id]);
}

export function transferTicket(id: number, newCreatorId: string): void {
  db.run("UPDATE tickets_tickets SET creator_id = ? WHERE id = ?", [newCreatorId, id]);
}

/** Enregistre l'heure de la première réponse du staff (une seule fois). */
export function markFirstResponse(id: number): void {
  db.run("UPDATE tickets_tickets SET first_response_at = ? WHERE id = ? AND first_response_at IS NULL", [Date.now(), id]);
}

export function deleteTicket(id: number): void {
  db.run("DELETE FROM tickets_tickets WHERE id = ?", [id]);
}

// ---------------------------------------------------------------------------
// Feedback (note 1-5 du créateur après fermeture)
// ---------------------------------------------------------------------------

export interface Feedback {
  ticket_id: number;
  guild_id: string;
  user_id: string;
  rating: number;
  comment: string;
  created_at: number;
}

export function saveFeedback(ticketId: number, guildId: string, userId: string, rating: number, comment = ""): void {
  const safe = Math.min(5, Math.max(1, Math.round(rating)));
  db.run(
    "INSERT INTO tickets_feedback (ticket_id, guild_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(ticket_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, created_at = excluded.created_at",
    [ticketId, guildId, userId, safe, comment, Date.now()]
  );
}

export function getFeedback(ticketId: number): Feedback | null {
  return (db.query("SELECT * FROM tickets_feedback WHERE ticket_id = ?").get(ticketId) as Feedback | null) ?? null;
}

// ---------------------------------------------------------------------------
// Salon de logs (transcripts)
// ---------------------------------------------------------------------------

export function getLogChannel(guildId: string): string | null {
  const row = db.query("SELECT channel_id FROM tickets_log_channel WHERE guild_id = ?").get(guildId) as {
    channel_id: string;
  } | null;
  return row?.channel_id ?? null;
}

export function setLogChannel(guildId: string, channelId: string | null): void {
  if (channelId === null) {
    db.run("DELETE FROM tickets_log_channel WHERE guild_id = ?", [guildId]);
    return;
  }
  db.run(
    "INSERT INTO tickets_log_channel (guild_id, channel_id) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id",
    [guildId, channelId]
  );
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export interface TicketStats {
  total: number;
  open: number;
  closed: number;
  /** Temps moyen (ms) avant la première réponse du staff, null si aucune donnée. */
  avgFirstResponseMs: number | null;
  /** Durée moyenne (ms) d'un ticket fermé, null si aucune donnée. */
  avgCloseMs: number | null;
  /** Note moyenne des feedbacks (1-5), null si aucun. */
  avgRating: number | null;
  feedbackCount: number;
}

export function getTicketStats(guildId: string): TicketStats {
  const counts = db
    .query(
      "SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open, SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed FROM tickets_tickets WHERE guild_id = ?"
    )
    .get(guildId) as { total: number; open: number | null; closed: number | null };
  const resp = db
    .query(
      "SELECT AVG(first_response_at - created_at) AS avg_ms FROM tickets_tickets WHERE guild_id = ? AND first_response_at IS NOT NULL"
    )
    .get(guildId) as { avg_ms: number | null };
  const dur = db
    .query(
      "SELECT AVG(closed_at - created_at) AS avg_ms FROM tickets_tickets WHERE guild_id = ? AND status = 'closed' AND closed_at IS NOT NULL"
    )
    .get(guildId) as { avg_ms: number | null };
  const fb = db
    .query("SELECT AVG(rating) AS avg_r, COUNT(*) AS n FROM tickets_feedback WHERE guild_id = ?")
    .get(guildId) as { avg_r: number | null; n: number };
  return {
    total: counts.total,
    open: counts.open ?? 0,
    closed: counts.closed ?? 0,
    avgFirstResponseMs: resp.avg_ms,
    avgCloseMs: dur.avg_ms,
    avgRating: fb.avg_r,
    feedbackCount: fb.n,
  };
}

export interface StaffStat {
  staff_id: string;
  claimed: number;
  avg_rating: number | null;
}

/** Par membre du staff : tickets pris en charge + note moyenne reçue. */
export function getStaffStats(guildId: string, limit = 10): StaffStat[] {
  return db
    .query(
      `SELECT t.claimed_by AS staff_id,
              COUNT(*) AS claimed,
              (SELECT AVG(f.rating) FROM tickets_feedback f WHERE f.ticket_id = t.id) AS avg_rating
       FROM tickets_tickets t
       WHERE t.guild_id = ? AND t.claimed_by IS NOT NULL
       GROUP BY t.claimed_by
       ORDER BY claimed DESC
       LIMIT ?`
    )
    .all(guildId, limit) as StaffStat[];
}
