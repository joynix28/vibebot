import { AuditLogEvent } from "discord.js";
import type { Guild, GuildAuditLogsEntry, GuildMember } from "discord.js";
import { getProtectConfig, isAntiraidExempt, isWhitelisted } from "../db.ts";
import { exceedsLimit } from "./limits.ts";
import { punish } from "./punish.ts";
import { syncTrustedChannelAction } from "./channelCache.ts";

// Chaîne commune à tous les événements anti-raid basés sur l'audit log :
// identifier l'exécuteur → vérifier l'exemption → vérifier que le module
// est activé → appliquer les limites → sanctionner → restauration.
// (Remplace l'ancien dispatcher guildAuditLogEntryCreate.js + les emits internes.)

type AntiraidFlagKey = "bots" | "webhooks" | "members" | "channels" | "roles" | "identity" | "permissions";

const FLAG_BY_ACTION = new Map<AuditLogEvent, AntiraidFlagKey>([
  [AuditLogEvent.BotAdd, "bots"],
  [AuditLogEvent.WebhookCreate, "webhooks"],
  [AuditLogEvent.MemberBanAdd, "members"],
  [AuditLogEvent.MemberBanRemove, "members"],
  [AuditLogEvent.MemberKick, "members"],
  [AuditLogEvent.ChannelCreate, "channels"],
  [AuditLogEvent.ChannelDelete, "channels"],
  [AuditLogEvent.ChannelUpdate, "channels"],
  [AuditLogEvent.ChannelOverwriteCreate, "channels"],
  [AuditLogEvent.ChannelOverwriteDelete, "channels"],
  [AuditLogEvent.ChannelOverwriteUpdate, "channels"],
  [AuditLogEvent.RoleCreate, "roles"],
  [AuditLogEvent.RoleDelete, "roles"],
  [AuditLogEvent.RoleUpdate, "roles"],
  [AuditLogEvent.GuildUpdate, "identity"],
  [AuditLogEvent.MemberRoleUpdate, "permissions"],
  [AuditLogEvent.EmojiCreate, "permissions"],
  [AuditLogEvent.EmojiDelete, "permissions"],
  [AuditLogEvent.EmojiUpdate, "permissions"],
  [AuditLogEvent.StickerCreate, "permissions"],
  [AuditLogEvent.StickerDelete, "permissions"],
  [AuditLogEvent.StickerUpdate, "permissions"],
  [AuditLogEvent.MemberMove, "permissions"],
  [AuditLogEvent.MemberDisconnect, "permissions"],
]);

const LIMITS_BY_ACTION = new Map<AuditLogEvent, string>([
  [AuditLogEvent.BotAdd, "antibot"],
  [AuditLogEvent.WebhookCreate, "antiwebhook"],
  [AuditLogEvent.MemberBanAdd, "antiban"],
  [AuditLogEvent.MemberBanRemove, "antiunban"],
  [AuditLogEvent.MemberKick, "antikick"],
  [AuditLogEvent.ChannelCreate, "antichannel"],
  [AuditLogEvent.ChannelDelete, "antichannel"],
  [AuditLogEvent.ChannelUpdate, "antichannel"],
  [AuditLogEvent.ChannelOverwriteCreate, "antichannel"],
  [AuditLogEvent.ChannelOverwriteDelete, "antichannel"],
  [AuditLogEvent.ChannelOverwriteUpdate, "antichannel"],
  [AuditLogEvent.RoleCreate, "antirole"],
  [AuditLogEvent.RoleDelete, "antirole"],
  [AuditLogEvent.RoleUpdate, "antirole"],
  [AuditLogEvent.GuildUpdate, "antiupdate"],
  [AuditLogEvent.MemberRoleUpdate, "antirank"],
  [AuditLogEvent.EmojiCreate, "antiemote"],
  [AuditLogEvent.EmojiDelete, "antiemote"],
  [AuditLogEvent.EmojiUpdate, "antiemote"],
  [AuditLogEvent.StickerCreate, "antisticker"],
  [AuditLogEvent.StickerDelete, "antisticker"],
  [AuditLogEvent.StickerUpdate, "antisticker"],
  [AuditLogEvent.MemberMove, "antimove"],
  [AuditLogEvent.MemberDisconnect, "antideco"],
]);

// Actions salons : même sous le seuil, on synchronise le cache (restauration post-raid).
const CHANNEL_CACHE_ACTIONS = new Set<AuditLogEvent>([
  AuditLogEvent.ChannelCreate,
  AuditLogEvent.ChannelDelete,
  AuditLogEvent.ChannelUpdate,
]);

export interface AntiraidActionOptions {
  /** Clé de libellé FR (REASON_LABELS) ou fonction la construisant. */
  actionKey: string | ((entry: GuildAuditLogsEntry, guild: Guild) => string);
  /** Garde supplémentaire avant les limites (ex. rôles dangereux réellement ajoutés). */
  preCheck?: (entry: GuildAuditLogsEntry, guild: Guild) => boolean | Promise<boolean>;
  /** Restauration / nettoyage après la sanction (suppression, recréation…). */
  revert?: (entry: GuildAuditLogsEntry, guild: Guild, member: GuildMember) => unknown;
}

export async function handleAntiraidAuditEntry(
  entry: GuildAuditLogsEntry,
  guild: Guild,
  action: AuditLogEvent,
  opts: AntiraidActionOptions,
): Promise<void> {
  if (!entry || !guild || entry.action !== action) return;

  const cfg = getProtectConfig(guild.id);
  const executorId = entry.executorId;
  if (!executorId) return;

  const botId = guild.client.user?.id ?? "";
  if (isAntiraidExempt(guild.id, guild.ownerId, botId, executorId)) {
    syncTrustedChannelAction(entry, guild);
    return;
  }

  const flag = FLAG_BY_ACTION.get(action);
  const moduleKey = LIMITS_BY_ACTION.get(action);
  if (!flag || !moduleKey || !cfg.antiraid[flag]) return;

  if (opts.preCheck && !(await opts.preCheck(entry, guild))) return;

  const bypass = isWhitelisted(guild.id, guild.ownerId, executorId);
  const extra = entry.extra as { count?: unknown } | null | undefined;
  const amount = Number(extra?.count) || 1;
  if (!exceedsLimit(guild.id, moduleKey, executorId, amount, bypass)) {
    if (CHANNEL_CACHE_ACTIONS.has(action)) syncTrustedChannelAction(entry, guild);
    return;
  }

  const member =
    guild.members.cache.get(executorId) ?? (await guild.members.fetch(executorId).catch(() => null));
  if (!member) return;

  const actionKey = typeof opts.actionKey === "function" ? opts.actionKey(entry, guild) : opts.actionKey;
  await punish(member, actionKey);
  if (opts.revert) await opts.revert(entry, guild, member);
}
