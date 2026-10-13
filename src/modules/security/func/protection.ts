import { AuditLogEvent, PermissionFlagsBits } from "discord.js";
import type { Guild, GuildMember } from "discord.js";
import { ensureGuild, parseNukeActions, parseBeastScores, parseWhitelist } from "./db.ts";

export const DANGEROUS_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageMessages,
];

export function isWhitelisted(guild: Guild, memberId: string, roleIds: string[]): boolean {
  const wl = parseWhitelist(ensureGuild(guild.id));
  if (wl.users.includes(memberId)) return true;
  return wl.roles.some((r) => roleIds.includes(r));
}

export function canBypass(guild: Guild, member: GuildMember | null): boolean {
  if (!member) return false;
  if (guild.ownerId === member.id) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
  const bot = guild.members.me;
  if (!bot) return false;
  return member.roles.highest.position > bot.roles.highest.position;
}

async function fetchExecutor(guild: Guild, logAction: AuditLogEvent): Promise<string | undefined> {
  try {
    const logs = await guild.fetchAuditLogs({ type: logAction, limit: 1 });
    return logs.entries.first()?.executor?.id;
  } catch {
    return undefined;
  }
}

const autoPunished = new Map<string, number>();

export function markAutoPunish(guildId: string, userId: string): void {
  autoPunished.set(`${guildId}:${userId}`, Date.now());
}

export function isAutoPunished(guildId: string, userId: string): boolean {
  const ts = autoPunished.get(`${guildId}:${userId}`);
  if (!ts) return false;
  if (Date.now() - ts > 60000) {
    autoPunished.delete(`${guildId}:${userId}`);
    return false;
  }
  return true;
}

const beastState = new Map<string, { active: boolean; until: number; score: number }>();

export function getBeast(guildId: string) {
  const s = beastState.get(guildId) ?? { active: false, until: 0, score: 0 };
  if (s.active && Date.now() > s.until) {
    s.active = false;
    s.score = 0;
  }
  beastState.set(guildId, s);
  return s;
}

async function notifyOwner(guild: Guild, msg: string): Promise<void> {
  const owner = guild.members.cache.get(guild.ownerId) ?? (await guild.members.fetch(guild.ownerId).catch(() => null));
  if (owner) await owner.send(msg).catch(() => {});
}

async function logSecurity(guild: Guild, msg: string): Promise<void> {
  const cfg = ensureGuild(guild.id);
  if (!cfg.security_log) return;
  const ch = guild.channels.cache.get(cfg.security_log);
  if (ch?.isTextBased()) await ch.send(msg).catch(() => {});
}

export function addBeastScore(guildId: string, points: number): boolean {
  const cfg = ensureGuild(guildId);
  if (!cfg.beast_enabled) return false;
  const s = getBeast(guildId);
  s.score += points;
  const limit = parseBeastScores(cfg).score_limit ?? cfg.beast_score_limit;
  if (limit > 0 && s.score >= limit) {
    s.active = true;
    s.until = Date.now() + 3600000;
    return true;
  }
  return false;
}

async function punish(guild: Guild, targetId: string, reason: string): Promise<void> {
  const cfg = ensureGuild(guild.id);
  const type = (cfg.nuke_punishment || "BAN").toUpperCase();
  markAutoPunish(guild.id, targetId);
  if (type === "KICK") await guild.members.kick(targetId, reason).catch(() => {});
  else await guild.bans.create(targetId, { reason }).catch(() => {});
  await logSecurity(guild, `:red_circle: | **<@${targetId}>** has been punished (${reason})`);
}

async function beastPunish(guild: Guild, targetId: string, reason: string): Promise<void> {
  const cfg = ensureGuild(guild.id);
  const type = (cfg.beast_punishment || "CLEAR_ROLES").toUpperCase();
  markAutoPunish(guild.id, targetId);
  if (type === "BAN") await guild.bans.create(targetId, { reason }).catch(() => {});
  else if (type === "KICK") await guild.members.kick(targetId, reason).catch(() => {});
  else {
    const m = await guild.members.fetch(targetId).catch(() => null);
    if (m) {
      const roles = m.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id);
      await m.roles.remove(roles, reason).catch(() => {});
    }
  }
  await logSecurity(guild, `:red_circle: | **<@${targetId}>** ${reason}`);
}

const actionLog = new Map<string, Map<string, { count: number; resetAt: number }>>();
const WINDOW = 10 * 60 * 1000;

function bumpAction(guildId: string, userId: string, action: string): number {
  let byUser = actionLog.get(guildId);
  if (!byUser) {
    byUser = new Map();
    actionLog.set(guildId, byUser);
  }
  const key = `${userId}:${action}`;
  const e = byUser.get(key);
  if (!e || Date.now() > e.resetAt) {
    byUser.set(key, { count: 1, resetAt: Date.now() + WINDOW });
    return 1;
  }
  e.count++;
  return e.count;
}

const BEAST_SCORE_KEY: Record<string, string> = {
  ban: "ban",
  kick: "kick",
  channel_create: "channel_create",
  channel_delete: "channel_delete",
  role_create: "role_create",
  role_delete: "role_delete",
  role_update: "role_update",
  role_add: "role_add",
  bot: "bot_add",
};

const ACTION_AUDIT: Record<string, AuditLogEvent> = {
  ban: AuditLogEvent.MemberBanAdd,
  kick: AuditLogEvent.MemberKick,
  bot: AuditLogEvent.BotAdd,
  role_create: AuditLogEvent.RoleCreate,
  role_delete: AuditLogEvent.RoleDelete,
  role_update: AuditLogEvent.RoleUpdate,
  role_add: AuditLogEvent.MemberRoleUpdate,
  channel_create: AuditLogEvent.ChannelCreate,
  channel_delete: AuditLogEvent.ChannelDelete,
};

export async function handleNuke(guild: Guild, action: string, fallbackExecutor?: string): Promise<void> {
  const cfg = ensureGuild(guild.id);
  if (!cfg.nuke_enabled) return;
  const acts = parseNukeActions(cfg);
  const act = acts[action];
  if (!act?.enabled) return;

  let executor: string | undefined;
  const logType = ACTION_AUDIT[action];
  if (logType) executor = await fetchExecutor(guild, logType);
  if (!executor) executor = fallbackExecutor;
  if (!executor || executor === guild.client.user?.id) return;

  const member = guild.members.cache.get(executor) ?? (await guild.members.fetch(executor).catch(() => null));
  if (isWhitelisted(guild, executor, member?.roles.cache.map((r) => r.id) ?? [])) return;
  if (canBypass(guild, member)) return;

  const scores = parseBeastScores(cfg);
  if (addBeastScore(guild.id, scores[BEAST_SCORE_KEY[action] ?? ""] ?? 0)) {
    await logSecurity(guild, ":green_circle: | The beast woke up as the server has reached the global score.");
    await notifyOwner(guild, ":green_circle: | The beast woke up as the server has reached the global score.");
  }

  if (getBeast(guild.id).active) {
    await beastPunish(guild, executor, `Beast mode: dangerous action (${action})`);
    return;
  }

  if (action === "invite") return;

  if (act.limit === undefined) return;
  const count = bumpAction(guild.id, executor, action);
  if (count > act.limit) {
    actionLog.get(guild.id)?.delete(`${executor}:${action}`);
    await punish(guild, executor, `Exceeded the ${action} limit (${act.limit})`);
  }
}

const timers = new Set<NodeJS.Timeout>();
const raidState = new Map<string, { joins: { id: string; at: number }[]; cumulative: number; windowResetAt: number; lockedUntil: number }>();
const RAID_WINDOW = 60 * 1000;

export async function lockGuild(guild: Guild, hours: number, reason: string): Promise<void> {
  for (const ch of guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).values()) {
    try {
      await (ch as any).permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason });
    } catch {}
  }
  const t = setTimeout(() => {
    unlockGuild(guild, "Anti-raid: lock expired").catch(() => {});
  }, hours * 3600000);
  timers.add(t);
}

export async function unlockGuild(guild: Guild, reason: string): Promise<void> {
  for (const ch of guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).values()) {
    try {
      await (ch as any).permissionOverwrites.edit(guild.id, { SendMessages: null }, { reason });
    } catch {}
  }
}

async function banTemporary(guild: Guild, userId: string, days: number, reason: string): Promise<void> {
  markAutoPunish(guild.id, userId);
  await guild.bans.create(userId, { reason }).catch(() => {});
  if (days > 0) {
    const t = setTimeout(() => {
      guild.bans.remove(userId, "Temporary anti-raid ban expired").catch(() => {});
    }, days * 86400000);
    timers.add(t);
  }
}

export async function handleRaid(guild: Guild, member: GuildMember): Promise<void> {
  const cfg = ensureGuild(guild.id);
  if (!cfg.raid_enabled) return;
  if (member.user.bot) return;
  if (isWhitelisted(guild, member.id, member.roles.cache.map((r) => r.id))) return;

  const now = Date.now();
  const st = raidState.get(guild.id) ?? { joins: [], cumulative: 0, windowResetAt: 0, lockedUntil: 0 };

  if (now < st.lockedUntil) {
    await banTemporary(guild, member.id, cfg.raid_punishment_days || 2, "Anti-raid: server is locked");
    return;
  }

  if (now > st.windowResetAt) {
    st.cumulative = 0;
    st.windowResetAt = now + RAID_WINDOW;
  }

  const ageMs = now - (member.user.createdTimestamp ?? now);
  const bypassMs = (cfg.raid_age_bypass_months || 6) * 30 * 86400000;

  let add = 0;
  if (ageMs < bypassMs) {
    if (!member.user.avatar) add += cfg.raid_no_avatar_score || 0;
    if (ageMs < 30 * 86400000) add += cfg.raid_age_score || 0;
    if (st.joins.some((j) => now - j.at < 10000)) add += cfg.raid_join_row_score || 0;
  }

  st.joins = st.joins.filter((j) => now - j.at < 120000);
  st.joins.push({ id: member.id, at: now });
  st.cumulative += add;
  raidState.set(guild.id, st);

  if (st.cumulative >= (cfg.raid_score_limit || 50)) {
    const toBan = st.joins.filter((j) => now - j.at < 60000).map((j) => j.id);
    for (const id of toBan) {
      await banTemporary(guild, id, cfg.raid_punishment_days || 2, "Anti-raid");
    }
    const hours = cfg.raid_lock_hours || 2;
    st.lockedUntil = now + hours * 3600000;
    st.joins = [];
    st.cumulative = 0;
    st.windowResetAt = now + RAID_WINDOW;
    raidState.set(guild.id, st);
    await lockGuild(guild, hours, "Anti-raid: server locked");
    await logSecurity(guild, ":red_circle: | Anti-raid triggered, server has been locked.");
    await notifyOwner(guild, ":red_circle: | Anti-raid triggered, server has been locked.");
  }
}
