// Dashboard web du bot Fusion (style DraftBot).
// OAuth2 Discord + pages de configuration par serveur + API JSON.
// Démarré depuis index.ts via startDashboard(client).

import type { Client, Guild } from "discord.js";
import { ChannelType } from "discord.js";
import path from "node:path";
import config from "../../config.ts";
import { isModuleEnabled, setModuleEnabled } from "../core/db.ts";
import { loadModuleMetas } from "../core/loader.ts";
import type { ModuleMeta } from "../core/types.ts";

// Couches de données des modules (leurs func/db.ts sont les propriétaires des tables).
import * as securityDb from "../modules/security/func/db.ts";
import * as protectionDb from "../modules/protection/func/db.ts";
import * as legacyDb from "../modules/legacy/func/db.ts";
import * as tempvoiceDb from "../modules/tempvoice/func/db.ts";
import * as backupDb from "../modules/backup/func/db.ts";
import * as froggyDb from "../modules/froggy/func/db.ts";
import * as musicDb from "../modules/music/func/db.ts";
import * as ticketsDb from "../modules/tickets/func/db.ts";
import * as economyDb from "../modules/economy/func/db.ts";

const PUBLIC_DIR = path.resolve(import.meta.dir, "public");
const SESSION_TTL = 7 * 24 * 3600 * 1000; // 7 jours
const SESSION_COOKIE = "fusion_session";
const MANAGE_GUILD = 32n;
const ADMINISTRATOR = 8n;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

interface OAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

interface SessionUser {
  id: string;
  username: string;
  avatar: string | null;
}

interface Session {
  user: SessionUser;
  guilds: OAuthGuild[];
  expiresAt: number;
}

const sessions = new Map<string, Session>();
const oauthStates = new Map<string, number>(); // state -> expiration

let metasPromise: Promise<ModuleMeta[]> | null = null;

function randomHex(bytes: number): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
}

function getSession(req: Request): Session | null {
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!m?.[1]) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(m[1]);
    return null;
  }
  return s;
}

function sessionCookie(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL / 1000}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Helpers Discord
// ---------------------------------------------------------------------------

function guildIconUrl(id: string, icon: string | null): string | null {
  if (!icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=128`;
}

function avatarUrl(id: string, avatar: string | null): string {
  if (avatar) return `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`;
  const idx = Number((BigInt(id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function canManage(g: OAuthGuild): boolean {
  const perms = BigInt(g.permissions);
  return (perms & (MANAGE_GUILD | ADMINISTRATOR)) !== 0n;
}

async function fetchGuild(client: Client, guildId: string): Promise<Guild | null> {
  const cached = client.guilds.cache.get(guildId);
  if (cached) return cached;
  try {
    return await client.guilds.fetch(guildId);
  } catch {
    return null;
  }
}

/** Vérifie session + ManageGuild (via les guilds OAuth en cache) + présence du bot. */
async function requireAccess(
  client: Client,
  req: Request,
  guildId: string
): Promise<{ guild: Guild; og: OAuthGuild } | Response> {
  const session = getSession(req);
  if (!session) return json({ error: "Non connecté." }, 401);
  const og = session.guilds.find((g) => g.id === guildId);
  if (!og) return json({ error: "Vous n'êtes pas membre de ce serveur." }, 403);
  if (!canManage(og)) return json({ error: "Permission « Gérer le serveur » requise." }, 403);
  const guild = await fetchGuild(client, guildId);
  if (!guild) return json({ error: "Le bot n'est pas présent sur ce serveur." }, 404);
  return { guild, og };
}

// ---------------------------------------------------------------------------
// Réponses
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function serveStatic(filePath: string): Promise<Response | null> {
  const resolved = path.resolve(PUBLIC_DIR, filePath);
  if (!resolved.startsWith(PUBLIC_DIR + path.sep)) return null;
  const file = Bun.file(resolved);
  if (!(await file.exists())) return null;
  const ext = path.extname(resolved).toLowerCase();
  return new Response(file, {
    headers: { "Content-Type": MIME[ext] ?? "application/octet-stream" },
  });
}

// ---------------------------------------------------------------------------
// Schémas de configuration des modules
// ---------------------------------------------------------------------------

export type FieldType = "boolean" | "text" | "number" | "channel" | "role" | "info";

export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  value: boolean | string | number | null;
  hint?: string;
  placeholder?: string;
}

export interface ModuleSchema {
  title: string;
  fields: SchemaField[];
}

export interface SchemaHandler {
  get(guildId: string): ModuleSchema;
  set(guildId: string, values: Record<string, unknown>): void;
}

function field(
  key: string,
  label: string,
  type: FieldType,
  value: boolean | string | number | null,
  hint?: string
): SchemaField {
  const f: SchemaField = { key, label, type, value };
  if (hint) f.hint = hint;
  return f;
}

function info(text: string): SchemaField {
  return { key: "info", label: "", type: "info", value: text };
}

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function asText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function getPath(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const k of dotted.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

// ---- security (NdProtect-like : anti-nuke, anti-raid, vérification) ----

const securityHandler: SchemaHandler = {
  get(guildId) {
    const g = securityDb.ensureGuild(guildId);
    return {
      title: "Sécurité — anti-nuke, anti-raid, vérification",
      fields: [
        field("nuke_enabled", "Anti-nuke", "boolean", g.nuke_enabled === 1, "Bloque les bannissements massifs et les suppressions de salons/rôles."),
        field("raid_enabled", "Protection anti-raid", "boolean", g.raid_enabled === 1, "Verrouille le serveur en cas d'arrivée massive de comptes suspects."),
        field("verify_enabled", "Vérification des nouveaux membres", "boolean", g.verify_enabled === 1, "Un captcha est demandé aux nouveaux membres avant l'accès au serveur."),
        field("beast_enabled", "Mode bête (surveillance avancée)", "boolean", g.beast_enabled === 1, "Système de score qui sanctionne les comportements suspects cumulés."),
        field("security_log", "Salon des logs de sécurité", "channel", g.security_log, "Anti-nuke, anti-raid, vérifications."),
        field("mod_log", "Salon des logs de modération", "channel", g.mod_log),
        field("verify_channel", "Salon de vérification", "channel", g.verify_channel, "Salon où le captcha est demandé."),
        field("verify_role", "Rôle après vérification", "role", g.verify_role, "Attribué une fois le captcha réussi."),
        field("mute_role", "Rôle muet", "role", g.mute_role, "Utilisé pour les sanctions de type mute."),
      ],
    };
  },
  set(guildId, values) {
    const g = securityDb.ensureGuild(guildId);
    for (const [k, v] of Object.entries(values)) {
      switch (k) {
        case "nuke_enabled": g.nuke_enabled = asBool(v) ? 1 : 0; break;
        case "raid_enabled": g.raid_enabled = asBool(v) ? 1 : 0; break;
        case "verify_enabled": g.verify_enabled = asBool(v) ? 1 : 0; break;
        case "beast_enabled": g.beast_enabled = asBool(v) ? 1 : 0; break;
        case "security_log": g.security_log = asText(v); break;
        case "mod_log": g.mod_log = asText(v); break;
        case "verify_channel": g.verify_channel = asText(v); break;
        case "verify_role": g.verify_role = asText(v); break;
        case "mute_role": g.mute_role = asText(v); break;
        default: break;
      }
    }
    securityDb.saveGuild(g);
  },
};

// ---- protection (NdProtect : antiraid, antispam, automod, logs) ----

const PUNISHMENTS = ["ban", "kick", "derank", "mute"] as const;

const protectionHandler: SchemaHandler = {
  get(guildId) {
    const c = protectionDb.getProtectConfig(guildId);
    const b = (dotted: string): boolean => getPath(c, dotted) === true;
    return {
      title: "Protection — anti-raid, anti-spam, logs",
      fields: [
        field("antiraid.bots", "Anti-raid : bots", "boolean", b("antiraid.bots"), "Bloque l'ajout massif de bots."),
        field("antiraid.webhooks", "Anti-raid : webhooks", "boolean", b("antiraid.webhooks"), "Bloque la création massive de webhooks."),
        field("antiraid.members", "Anti-raid : arrivées", "boolean", b("antiraid.members"), "Réagit aux arrivées massives de membres."),
        field("antiraid.channels", "Anti-raid : salons", "boolean", b("antiraid.channels"), "Surveille les créations/suppressions de salons."),
        field("antiraid.roles", "Anti-raid : rôles", "boolean", b("antiraid.roles"), "Surveille les créations/suppressions de rôles."),
        field("antiraid.permissions", "Anti-raid : permissions", "boolean", b("antiraid.permissions"), "Surveille les modifications de permissions."),
        field("antiraid.punish", "Sanction anti-raid", "text", String(getPath(c, "antiraid.punish") ?? "ban"), "ban, kick, derank ou mute."),
        field("antispam.enabled", "Anti-spam", "boolean", b("antispam.enabled"), "Détecte et bloque le spam de messages."),
        field("muteRole", "Rôle muet", "role", (getPath(c, "muteRole") as string | null) ?? null),
      ],
    };
  },
  set(guildId, values) {
    const c = protectionDb.getProtectConfig(guildId);
    for (const [k, v] of Object.entries(values)) {
      if (k === "antiraid.punish") {
        const t = asText(v)?.toLowerCase();
        if (t && (PUNISHMENTS as readonly string[]).includes(t)) setPath(c as unknown as Record<string, unknown>, k, t);
      } else if (k === "muteRole") {
        setPath(c as unknown as Record<string, unknown>, k, asText(v));
      } else {
        setPath(c as unknown as Record<string, unknown>, k, asBool(v));
      }
    }
    protectionDb.saveProtectConfig(guildId, c);
  },
};

// ---- legacy (Communauté : logs, tickets, invitations) ----

const legacyHandler: SchemaHandler = {
  get(guildId) {
    const logs = legacyDb.getLogsConfig(guildId);
    const ticket = legacyDb.getTicketConfig(guildId);
    const invite = legacyDb.getInviteConfig(guildId);
    return {
      title: "Communauté — logs, tickets, invitations",
      fields: [
        field("logs.moderation", "Logs de modération", "channel", logs.moderation ?? null),
        field("logs.messages", "Logs des messages", "channel", logs.messages ?? null, "Messages modifiés et supprimés."),
        field("logs.arrivees", "Logs des arrivées", "channel", logs.arrivees ?? null),
        field("logs.vocal", "Logs vocaux", "channel", logs.vocal ?? null),
        field("ticket.support_role", "Rôle support (tickets)", "role", ticket.support_role, "Notifié à l'ouverture d'un ticket."),
        field("ticket.log_channel", "Salon des logs de tickets", "channel", ticket.log_channel),
        field("invite.join_channel", "Salon des messages d'arrivée", "channel", invite.join_channel),
        field("invite.join_message", "Message d'arrivée", "text", invite.join_message, "Variables : {user} {server} {count} {inviter}"),
      ],
    };
  },
  set(guildId, values) {
    const logs = legacyDb.getLogsConfig(guildId);
    const ticket = legacyDb.getTicketConfig(guildId);
    const invite = legacyDb.getInviteConfig(guildId);
    for (const [k, v] of Object.entries(values)) {
      if (k.startsWith("logs.")) {
        logs[k.slice(5)] = asText(v);
      } else if (k.startsWith("ticket.")) {
        const sub = k.slice(7);
        if (sub === "support_role") ticket.support_role = asText(v);
        else if (sub === "log_channel") ticket.log_channel = asText(v);
      } else if (k.startsWith("invite.")) {
        const sub = k.slice(7);
        if (sub === "join_channel") invite.join_channel = asText(v);
        else if (sub === "join_message") invite.join_message = asText(v);
      }
    }
    legacyDb.saveLogsConfig(guildId, logs);
    legacyDb.saveTicketConfig(ticket);
    legacyDb.saveInviteConfig(invite);
  },
};

// ---- tempvoice (salons vocaux temporaires) ----

const tempvoiceHandler: SchemaHandler = {
  get(guildId) {
    const creators = tempvoiceDb.allCreators();
    const active = tempvoiceDb.allTemps().length;
    return {
      title: "Salons vocaux — salons créateurs",
      fields: [
        info(
          "Les salons « créateurs » sont des salons vocaux : quand un membre les rejoint, " +
            "un salon temporaire personnel est créé pour lui. Utilisez la commande /voice-setup " +
            "pour créer de nouveaux salons créateurs ou gérer les options avancées (nom, limite, …)."
        ),
        field("creator", "Salon créateur", "channel", creators[0] ?? null, "Le salon vocal qui génère les salons temporaires."),
        info(`${active} salon(s) temporaire(s) actuellement suivi(s) par le bot.`),
      ],
    };
  },
  set(guildId, values) {
    const raw = values["creator"];
    const next = asText(raw);
    const current = tempvoiceDb.allCreators();
    if ((current[0] ?? null) === next) return;
    for (const id of current) tempvoiceDb.rmCreator(id);
    if (next) tempvoiceDb.addCreator(next);
  },
};

// ---- backup (Xénon : sauvegardes) ----

const backupHandler: SchemaHandler = {
  get(guildId) {
    const g = backupDb.g(guildId);
    const hours = Math.round((g.backup_interval_ms / 3600000) * 100) / 100;
    return {
      title: "Backups — sauvegardes du serveur",
      fields: [
        field("auto_hours", "Sauvegarde automatique (en heures)", "number", hours, "0 = désactivé. Le bot sauvegarde le serveur à intervalle régulier."),
        field("moderation_enabled", "Modération Xénon", "boolean", g.moderation_enabled === 1),
        field("xp_enabled", "Système de niveaux", "boolean", g.xp_enabled === 1),
        field("xp_notify_channel", "Salon des annonces de niveau", "channel", g.xp_notify_channel),
        field("security_log", "Salon des logs de sécurité", "channel", g.security_log),
        field("mod_log", "Salon des logs de modération", "channel", g.mod_log),
        info("Créez, chargez et gérez vos sauvegardes avec les commandes /backup, /template et /sync."),
      ],
    };
  },
  set(guildId, values) {
    const g = backupDb.g(guildId);
    for (const [k, v] of Object.entries(values)) {
      switch (k) {
        case "auto_hours": {
          const n = Number(v);
          g.backup_interval_ms = Number.isFinite(n) && n > 0 ? Math.round(n * 3600000) : 0;
          break;
        }
        case "moderation_enabled": g.moderation_enabled = asBool(v) ? 1 : 0; break;
        case "xp_enabled": g.xp_enabled = asBool(v) ? 1 : 0; break;
        case "xp_notify_channel": g.xp_notify_channel = asText(v); break;
        case "security_log": g.security_log = asText(v); break;
        case "mod_log": g.mod_log = asText(v); break;
        default: break;
      }
    }
    backupDb.sv(g);
  },
};

// ---- froggy (piège à bots spam) ----

const FROG_ACTIONS = ["softban", "ban", "disabled"] as const;

const froggyHandler: SchemaHandler = {
  get(guildId) {
    const c = froggyDb.ensure(guildId);
    const tactics = froggyDb.parseTactics(c);
    const caught = froggyDb.tot(guildId);
    return {
      title: "Froggy — piège à bots spam",
      fields: [
        field("action", "Action du piège", "text", c.action, "softban (expulser), ban (bannir) ou disabled (surveillance seule)."),
        field("trap_channel", "Salon piège", "channel", c.trap_channel, "Tout message envoyé ici déclenche le piège."),
        field("log_channel", "Salon de logs", "channel", c.log_channel),
        field("tactic.no_dm", "Ne pas envoyer de DM", "boolean", tactics.includes("no_dm"), "Ne pas prévenir les comptes piégés par message privé."),
        field("tactic.dm_rejoin", "DM avec lien de réinvitation", "boolean", tactics.includes("dm_rejoin"), "Envoie un lien pour revenir après un softban."),
        field("tactic.new_account_only", "Nouveaux comptes uniquement", "boolean", tactics.includes("new_account_only"), "Ne piège que les comptes récemment créés."),
        info(`${caught} compte(s) piégé(s) au total sur ce serveur.`),
      ],
    };
  },
  set(guildId, values) {
    const c = froggyDb.ensure(guildId);
    const tactics = new Set(froggyDb.parseTactics(c));
    for (const [k, v] of Object.entries(values)) {
      if (k === "action") {
        const t = asText(v)?.toLowerCase();
        if (t && (FROG_ACTIONS as readonly string[]).includes(t)) {
          froggyDb.setAction(guildId, t as (typeof FROG_ACTIONS)[number]);
        }
      } else if (k === "trap_channel") {
        froggyDb.setTrapChannel(guildId, asText(v));
      } else if (k === "log_channel") {
        froggyDb.setLogChannel(guildId, asText(v));
      } else if (k.startsWith("tactic.")) {
        const name = k.slice(7) as froggyDb.Tactic;
        if ((froggyDb.tactics as readonly string[]).includes(name)) {
          if (asBool(v)) tactics.add(name);
          else tactics.delete(name);
        }
      }
    }
    froggyDb.setTactics(guildId, [...tactics] as froggyDb.Tactic[]);
  },
};

// ---- music (réglages serveur) ----

const musicHandler: SchemaHandler = {
  get(guildId) {
    const s = musicDb.getSettings(guildId);
    return {
      title: "Musique — lecture, DJ et playlists",
      fields: [
        field("dj_role", "Rôle DJ", "role", s.dj_role, "Les DJ peuvent contrôler la musique sans vote."),
        field("text_channel", "Salon texte dédié", "channel", s.text_channel, "Les commandes musique y sont limitées si défini."),
        field("voice_channel", "Salon vocal dédié", "channel", s.voice_channel, "Le bot y reste connecté si défini."),
        field("default_volume", "Volume par défaut", "number", s.default_volume, "0 à 100."),
        field("skip_percent", "Pourcentage de votes pour skip", "number", s.skip_percent, "1 à 100."),
        field("stay_time", "Reste dans le salon (secondes)", "number", s.stay_time, "Temps avant déconnexion quand la file est vide."),
      ],
    };
  },
  set(guildId, values) {
    const patch: musicDb.SettingsPatch = {};
    for (const [k, v] of Object.entries(values)) {
      switch (k) {
        case "dj_role": patch.dj_role = asText(v); break;
        case "text_channel": patch.text_channel = asText(v); break;
        case "voice_channel": patch.voice_channel = asText(v); break;
        case "default_volume": {
          const n = Number(v);
          if (Number.isFinite(n)) patch.default_volume = Math.max(0, Math.min(100, Math.round(n)));
          break;
        }
        case "skip_percent": {
          const n = Number(v);
          if (Number.isFinite(n)) patch.skip_percent = Math.max(1, Math.min(100, Math.round(n)));
          break;
        }
        case "stay_time": {
          const n = Number(v);
          if (Number.isFinite(n)) patch.stay_time = Math.max(0, Math.min(3600, Math.round(n)));
          break;
        }
        default: break;
      }
    }
    musicDb.saveSettings(guildId, patch);
  },
};

// ---- tickets (salon de logs) ----

const ticketsHandler: SchemaHandler = {
  get(guildId) {
    return {
      title: "Tickets — support",
      fields: [
        info("Les panels de tickets se créent avec la commande /ticket-panel dans Discord."),
        field("log_channel", "Salon des transcripts", "channel", ticketsDb.getLogChannel(guildId), "Les transcripts des tickets fermés y sont envoyés."),
      ],
    };
  },
  set(guildId, values) {
    for (const [k, v] of Object.entries(values)) {
      if (k === "log_channel") ticketsDb.setLogChannel(guildId, asText(v));
    }
  },
};

// ---- economy (monnaie et gains) ----

const economyHandler: SchemaHandler = {
  get(guildId) {
    const c = economyDb.getConfig(guildId);
    return {
      title: "Économie — monnaie et gains",
      fields: [
        field("currency_name", "Nom de la monnaie", "text", c.currency_name, "Ex : Pièces, Or…"),
        field("daily_amount", "Gain quotidien", "number", c.daily_amount, "Montant de /economie quotidien."),
      ],
    };
  },
  set(guildId, values) {
    for (const [k, v] of Object.entries(values)) {
      if (k === "currency_name") {
        const t = asText(v);
        if (t) economyDb.setCurrencyName(guildId, t.slice(0, 30));
      } else if (k === "daily_amount") {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) economyDb.setDailyAmount(guildId, Math.floor(n));
      }
    }
  },
};

const handlers: Record<string, SchemaHandler> = {
  security: securityHandler,
  protection: protectionHandler,
  legacy: legacyHandler,
  tempvoice: tempvoiceHandler,
  backup: backupHandler,
  froggy: froggyHandler,
  music: musicHandler,
  tickets: ticketsHandler,
  economy: economyHandler,
};

// ---------------------------------------------------------------------------
// OAuth2 Discord
// ---------------------------------------------------------------------------

async function handleLogin(): Promise<Response> {
  if (!config.clientId || !config.redirectUri) {
    return json({ error: "OAuth2 non configuré (CLIENT_ID / REDIRECT_URI manquants)." }, 500);
  }
  const state = randomHex(16);
  oauthStates.set(state, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify guilds",
    state,
  });
  return Response.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`, 302);
}

async function handleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");
  if (err) return Response.redirect(`${config.baseUrl}/?error=${encodeURIComponent(err)}`, 302);
  if (!code || !state) return json({ error: "Paramètres OAuth2 manquants." }, 400);

  const exp = oauthStates.get(state);
  oauthStates.delete(state);
  if (!exp || exp < Date.now()) return json({ error: "Session OAuth2 expirée, réessayez." }, 400);

  // Échange du code contre un token.
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    console.error("[dashboard] échange OAuth2 refusé:", tokenRes.status);
    return json({ error: "Échec de l'authentification Discord, réessayez." }, 502);
  }
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;
  if (!accessToken) return json({ error: "Échec de l'authentification Discord, réessayez." }, 502);

  const headers = { Authorization: `Bearer ${accessToken}` };
  const [meRes, guildsRes] = await Promise.all([
    fetch("https://discord.com/api/users/@me", { headers }),
    fetch("https://discord.com/api/users/@me/guilds", { headers }),
  ]);
  if (!meRes.ok || !guildsRes.ok) {
    return json({ error: "Impossible de récupérer votre profil Discord." }, 502);
  }
  const me = (await meRes.json()) as { id: string; username: string; avatar: string | null };
  const guilds = (await guildsRes.json()) as OAuthGuild[];

  const token = randomHex(32);
  sessions.set(token, { user: { id: me.id, username: me.username, avatar: me.avatar }, guilds, expiresAt: Date.now() + SESSION_TTL });

  const secure = config.baseUrl.startsWith("https://");
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/dashboard",
      "Set-Cookie": sessionCookie(token, secure),
    },
  });
}

function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearSessionCookie() },
  });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

interface GuildChannelInfo {
  id: string;
  name: string;
  kind: "text" | "voice" | "category" | "other";
}

interface GuildRoleInfo {
  id: string;
  name: string;
  color: number;
}

async function apiMe(req: Request): Promise<Response> {
  const session = getSession(req);
  if (!session) return json({ error: "Non connecté." }, 401);
  const u = session.user;
  return json({ id: u.id, username: u.username, avatar: avatarUrl(u.id, u.avatar) });
}

async function apiGuilds(client: Client, req: Request): Promise<Response> {
  const session = getSession(req);
  if (!session) return json({ error: "Non connecté." }, 401);
  const manageable = session.guilds.filter(canManage);
  // Parallèle + cache d'abord : évite N appels API séquentiels (lent).
  const results = await Promise.all(
    manageable.map(async (og) => {
      const cached = client.guilds.cache.get(og.id);
      const guild = cached ?? (await fetchGuild(client, og.id).catch(() => null));
      if (!guild) return null; // le bot doit être sur le serveur
      return { id: og.id, name: guild.name, icon: guildIconUrl(og.id, og.icon) };
    })
  );
  const out = results.filter((g): g is { id: string; name: string; icon: string | null } => g !== null);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return json(out);
}

/** Statistiques publiques du bot (landing + dashboard). */
async function apiStats(client: Client): Promise<Response> {
  const metas = await metasPromise!;
  let members = 0;
  for (const g of client.guilds.cache.values()) members += g.memberCount ?? 0;
  return json({
    guilds: client.guilds.cache.size,
    members,
    commands: client.commands?.size ?? 0,
    modules: metas.length,
    uptime: Math.floor(process.uptime()),
  });
}

/** Explorateur de commandes d'un serveur (regroupées par module). */
async function apiGuildCommands(client: Client, req: Request, guildId: string): Promise<Response> {
  const access = await requireAccess(client, req, guildId);
  if (access instanceof Response) return access;
  const out: { name: string; description: string; moduleId: string }[] = [];
  for (const cmd of client.commands?.values() ?? []) {
    out.push({
      name: cmd.data.name,
      description: cmd.data.description ?? "",
      moduleId: cmd.module ?? "core",
    });
  }
  out.sort((a, b) => a.moduleId.localeCompare(b.moduleId) || a.name.localeCompare(b.name));
  return json(out);
}

async function apiGuild(client: Client, req: Request, guildId: string): Promise<Response> {
  const access = await requireAccess(client, req, guildId);
  if (access instanceof Response) return access;
  const { guild } = access;
  const metas = await metasPromise!;

  const channels: GuildChannelInfo[] = [];
  for (const ch of guild.channels.cache.values()) {
    let kind: GuildChannelInfo["kind"] = "other";
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement || ch.type === ChannelType.GuildForum) kind = "text";
    else if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) kind = "voice";
    else if (ch.type === ChannelType.GuildCategory) kind = "category";
    if (kind === "other") continue;
    channels.push({ id: ch.id, name: ch.name, kind });
  }
  channels.sort((a, b) => a.name.localeCompare(b.name));

  const roles: GuildRoleInfo[] = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color }));

  const modules = metas.map((m) => ({
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    description: m.description,
    enabled: isModuleEnabled(guildId, m.id),
  }));

  return json({
    id: guild.id,
    name: guild.name,
    icon: guildIconUrl(guild.id, guild.icon),
    memberCount: guild.memberCount,
    channelCount: guild.channels.cache.size,
    commandCount: client.commands?.size ?? 0,
    modules,
    channels,
    roles,
  });
}

async function apiToggle(client: Client, req: Request, guildId: string, moduleId: string): Promise<Response> {
  const access = await requireAccess(client, req, guildId);
  if (access instanceof Response) return access;
  const metas = await metasPromise!;
  if (!metas.some((m) => m.id === moduleId)) {
    return json({ error: "Module inconnu." }, 404);
  }
  const body = (await req.json().catch(() => null)) as { enabled?: unknown } | null;
  if (typeof body?.enabled !== "boolean") {
    return json({ error: "Paramètre « enabled » invalide." }, 400);
  }
  setModuleEnabled(guildId, moduleId, body.enabled);
  return json({ ok: true, enabled: body.enabled });
}

async function apiSchema(client: Client, req: Request, guildId: string, moduleId: string): Promise<Response> {
  const access = await requireAccess(client, req, guildId);
  if (access instanceof Response) return access;
  const handler = handlers[moduleId];
  if (!handler) {
    const metas = await metasPromise!;
    const meta = metas.find((m) => m.id === moduleId);
    return json({
      title: meta?.name ?? moduleId,
      fields: [info("Ce module se configure via ses commandes slash dans Discord.")],
    });
  }
  try {
    return json(handler.get(guildId));
  } catch (e) {
    console.error("[dashboard] schéma", moduleId, e);
    return json({ error: "Impossible de charger la configuration de ce module." }, 500);
  }
}

async function apiConfig(client: Client, req: Request, guildId: string, moduleId: string): Promise<Response> {
  const access = await requireAccess(client, req, guildId);
  if (access instanceof Response) return access;
  const handler = handlers[moduleId];
  if (!handler) return json({ error: "Ce module se configure via ses commandes slash." }, 400);
  const body = (await req.json().catch(() => null)) as { values?: unknown } | null;
  if (!body || typeof body.values !== "object" || body.values === null) {
    return json({ error: "Corps de requête invalide (attendu : { values })." }, 400);
  }
  try {
    handler.set(guildId, body.values as Record<string, unknown>);
    return json({ ok: true });
  } catch (e) {
    console.error("[dashboard] sauvegarde", moduleId, e);
    return json({ error: "Échec de la sauvegarde, réessayez." }, 500);
  }
}

// ---------------------------------------------------------------------------
// Routage
// ---------------------------------------------------------------------------

async function handle(client: Client, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;

  // OAuth2
  if (p === "/login" && req.method === "GET") return handleLogin();
  if (p === "/callback" && req.method === "GET") return handleCallback(url);
  if (p === "/logout" && req.method === "GET") return handleLogout();

  // API
  if (p === "/api/me" && req.method === "GET") return apiMe(req);
  if (p === "/api/guilds" && req.method === "GET") return apiGuilds(client, req);
  if (p === "/api/public" && req.method === "GET") return json({ clientId: config.clientId });
  if (p === "/api/stats" && req.method === "GET") return apiStats(client);

  const guildMatch = p.match(/^\/api\/guild\/(\d+)$/);
  if (guildMatch && req.method === "GET") return apiGuild(client, req, guildMatch[1]!);

  const cmdsMatch = p.match(/^\/api\/guild\/(\d+)\/commands$/);
  if (cmdsMatch && req.method === "GET") return apiGuildCommands(client, req, cmdsMatch[1]!);

  const toggleMatch = p.match(/^\/api\/guild\/(\d+)\/modules\/([a-z0-9_-]+)\/toggle$/);
  if (toggleMatch && req.method === "POST") return apiToggle(client, req, toggleMatch[1]!, toggleMatch[2]!);

  const schemaMatch = p.match(/^\/api\/guild\/(\d+)\/modules\/([a-z0-9_-]+)\/schema$/);
  if (schemaMatch && req.method === "GET") return apiSchema(client, req, schemaMatch[1]!, schemaMatch[2]!);

  const configMatch = p.match(/^\/api\/guild\/(\d+)\/modules\/([a-z0-9_-]+)\/config$/);
  if (configMatch && req.method === "POST") return apiConfig(client, req, configMatch[1]!, configMatch[2]!);

  if (p.startsWith("/api/")) return json({ error: "Route inconnue." }, 404);

  // Pages
  if (p === "/" && req.method === "GET") {
    const r = await serveStatic("index.html");
    if (r) return r;
  }
  if ((p === "/dashboard" || p === "/dashboard/") && req.method === "GET") {
    if (!getSession(req)) return Response.redirect("/", 302);
    const r = await serveStatic("dashboard.html");
    if (r) return r;
  }
  const guildPageMatch = p.match(/^\/dashboard\/(\d+)\/?$/);
  if (guildPageMatch && req.method === "GET") {
    if (!getSession(req)) return Response.redirect("/", 302);
    const r = await serveStatic("guild.html");
    if (r) return r;
  }

  // Fichiers statiques
  if (req.method === "GET") {
    const r = await serveStatic(p.slice(1) || "index.html");
    if (r) return r;
  }

  return new Response("Page introuvable.", { status: 404 });
}

/** Démarre le dashboard web (Bun.serve). */
export function startDashboard(client: Client): void {
  metasPromise = loadModuleMetas();
  const port = client.config.dashboardPort;

  // Purge horaire des sessions et états OAuth expirés.
  setInterval(() => {
    const now = Date.now();
    for (const [token, s] of sessions) {
      if (s.expiresAt < now) sessions.delete(token);
    }
    for (const [state, exp] of oauthStates) {
      if (exp < now) oauthStates.delete(state);
    }
  }, 3600_000).unref?.();

  Bun.serve({
    port,
    async fetch(req) {
      try {
        return await handle(client, req);
      } catch (e) {
        console.error("[dashboard] erreur:", e);
        if (new URL(req.url).pathname.startsWith("/api/")) {
          return json({ error: "Erreur interne du serveur." }, 500);
        }
        return new Response("Erreur interne du serveur.", { status: 500 });
      }
    },
  });
  console.log(`[dashboard] en ligne sur http://localhost:${port}`);
}
