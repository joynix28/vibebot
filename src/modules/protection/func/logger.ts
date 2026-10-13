// Logs serveur de NdProtect portés en TypeScript strict.
// Regroupe serverLogs.js (builders d'embeds) et logQueue.js (batching).

import {
  ActionRowBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  PermissionFlagsBits,
} from "discord.js";
import type {
  APIEmbed,
  Guild,
  GuildAuditLogsEntry,
  GuildBasedChannel,
  Message,
  MessageCreateOptions,
  PartialGuildMember,
  Role,
  User,
} from "discord.js";
import { getProtectConfig } from "../func/db.ts";

export type LogCategory = "antiraid" | "moderation" | "members" | "server" | "messages";

const SUPPORT_URL = "https://discord.gg/remaders";

export const COLORS = {
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xf0b132,
} as const;

const FULL_PERM_LABELS: Record<string, string> = {
  CreateInstantInvite: "Créer une invitation",
  KickMembers: "Expulser des membres",
  BanMembers: "Bannir des membres",
  Administrator: "Administrateur",
  ManageChannels: "Gérer les salons",
  ManageGuild: "Gérer le serveur",
  AddReactions: "Ajouter des réactions",
  ViewAuditLog: "Voir les logs du serveur",
  PrioritySpeaker: "Voix prioritaire",
  Stream: "Vidéo",
  ViewChannel: "Voir les salons",
  SendMessages: "Envoyer des messages et créer des posts",
  SendTTSMessages: "Envoyer des messages TTS",
  ManageMessages: "Gérer les messages",
  EmbedLinks: "Intégrer des liens",
  AttachFiles: "Joindre des fichiers",
  ReadMessageHistory: "Voir les anciens messages",
  MentionEveryone: "Mentionner @everyone, @here et tous les rôles",
  UseExternalEmojis: "Utiliser des émojis externes",
  ViewGuildInsights: "Voir les statistiques",
  Connect: "Se connecter",
  Speak: "Parler",
  MuteMembers: "Mute des membres",
  DeafenMembers: "Rendre sourd des membres",
  MoveMembers: "Déplacer des membres",
  UseVAD: "Utiliser la Détection de la voix",
  ChangeNickname: "Changer le pseudo",
  ManageNicknames: "Gérer les pseudos",
  ManageRoles: "Gérer les rôles",
  ManageWebhooks: "Gérer les webhooks",
  ManageGuildExpressions: "Gérer les emojis et stickers",
  UseApplicationCommands: "Utiliser les commandes de l'application",
  RequestToSpeak: "Demande de prise de parole",
  ManageEvents: "Gérer les événements",
  ManageThreads: "Gérer les threads",
  CreatePublicThreads: "Créer des fils publics",
  CreatePrivateThreads: "Créer des fils privés",
  UseExternalStickers: "Utiliser des autocollants externes",
  SendMessagesInThreads: "Envoyer des messages dans les fils et les posts",
  UseEmbeddedActivities: "Utiliser les Activités",
  ModerateMembers: "Exclure temporairement",
  UseSoundboard: "Utiliser Soundboard",
  CreateGuildExpressions: "Créer des expressions",
  CreateEvents: "Créer des événements",
  UseExternalSounds: "Utiliser des sons externes",
  SendVoiceMessages: "Envoyer des messages vocaux",
  SendPolls: "Créer des sondages",
  UseExternalApps: "Utiliser des applications externes",
};

/** Snapshots des rôles au départ d'un membre (pour le bouton "Restaurer les rôles"). */
export const memberRoleSnapshots = new Map<string, string[]>();

/** True si ce salon est un salon de logs (anti-boucles). */
export function isLogChannel(guildId: string, channelId: string): boolean {
  const logs = getProtectConfig(guildId).logs;
  const categories: LogCategory[] = ["antiraid", "moderation", "members", "server", "messages"];
  return categories.some((k) => logs[k] === channelId);
}

// ---------------------------------------------------------------------------
// Envoi direct
// ---------------------------------------------------------------------------

/** Envoie dans le salon de logs configuré pour la catégorie. Null si non configuré / erreur. */
export async function sendServerLog(
  guild: Guild,
  category: LogCategory,
  contentOrOptions: string | MessageCreateOptions
): Promise<Message | null> {
  const channelId = getProtectConfig(guild.id).logs[category];
  if (!channelId) return null;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return null;

  return channel.send(contentOrOptions).catch(() => null);
}

// ---------------------------------------------------------------------------
// Batching (port de logQueue.js)
// ---------------------------------------------------------------------------

const FLUSH_DELAY_MS = 1000;
const MAX_EMBEDS_PER_MESSAGE = 10;

interface BucketEntry {
  embed: EmbedBuilder;
  components?: ActionRowBuilder<ButtonBuilder>[];
}

interface Bucket {
  guild: Guild;
  entries: BucketEntry[];
  timer: ReturnType<typeof setTimeout> | null;
}

const buckets = new Map<string, Bucket>();

function bucketKey(guildId: string, category: LogCategory): string {
  return `${guildId}:${category}`;
}

function normalizeEmbed(embed: EmbedBuilder | APIEmbed): EmbedBuilder {
  return embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
}

function scheduleFlush(guild: Guild, category: LogCategory): void {
  const key = bucketKey(guild.id, category);
  const bucket = buckets.get(key);
  if (!bucket) return;

  if (bucket.timer) clearTimeout(bucket.timer);
  bucket.timer = setTimeout(() => {
    void flushBucket(guild, category).catch(() => {});
  }, FLUSH_DELAY_MS);
}

function pushEntry(
  guild: Guild,
  category: LogCategory,
  embed: EmbedBuilder | APIEmbed,
  components?: ActionRowBuilder<ButtonBuilder>[]
): void {
  const key = bucketKey(guild.id, category);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { guild, entries: [], timer: null };
    buckets.set(key, bucket);
  }
  bucket.entries.push({ embed: normalizeEmbed(embed), components });
  scheduleFlush(guild, category);
}

/** Ajoute un embed au batch de la catégorie (flush après 1s, max 10 embeds/message). */
export function enqueueLogEmbed(
  guild: Guild,
  category: LogCategory,
  embed: EmbedBuilder | APIEmbed
): void {
  pushEntry(guild, category, embed);
}

/** Comme enqueueLogEmbed mais envoie un message séparé avec des composants (boutons). */
export function enqueueLogMessage(
  guild: Guild,
  category: LogCategory,
  embed: EmbedBuilder | APIEmbed,
  components: ActionRowBuilder<ButtonBuilder>[] = []
): void {
  pushEntry(guild, category, embed, components);
}

export async function flushBucket(guild: Guild, category: LogCategory): Promise<void> {
  const key = bucketKey(guild.id, category);
  const bucket = buckets.get(key);
  if (!bucket?.entries.length) {
    buckets.delete(key);
    return;
  }

  buckets.delete(key);
  if (bucket.timer) clearTimeout(bucket.timer);

  const channelId = getProtectConfig(guild.id).logs[category];
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  let batch: EmbedBuilder[] = [];
  const sendBatch = async (): Promise<void> => {
    if (!batch.length) return;
    await channel.send({ embeds: batch }).catch(() => {});
    batch = [];
  };

  for (const entry of bucket.entries) {
    if (entry.components) {
      await sendBatch();
      await channel
        .send({ embeds: [entry.embed], components: entry.components })
        .catch(() => {});
      continue;
    }
    batch.push(entry.embed);
    if (batch.length >= MAX_EMBEDS_PER_MESSAGE) await sendBatch();
  }

  await sendBatch();
}

/** Retourne l'entrée d'audit log la plus récente visant cette cible (ou null). */
export async function findAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId: string
): Promise<GuildAuditLogsEntry | null> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const now = Date.now();
    for (const entry of logs.entries.values()) {
      const target = entry.target;
      const entryTargetId = target && "id" in target ? target.id : null;
      if (entryTargetId === targetId && now - entry.createdTimestamp < 15_000) {
        return entry;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers de formatage
// ---------------------------------------------------------------------------

function formatRoleStyle(role: Role): string {
  if (role.hexColor === "#000000") return "Transparent";
  if (role.colors.secondaryColor !== role.colors.primaryColor) {
    return `Dégradé (${role.colors.primaryColor} → ${role.colors.secondaryColor})`;
  }
  return `Solide (${role.hexColor})`;
}

function formatRolePermissionsLog(role: Role): string {
  if (role.permissions.has(PermissionFlagsBits.Administrator)) return "Administrateur";
  const names = role.permissions.toArray().map((p) => FULL_PERM_LABELS[p] ?? p);
  if (!names.length) return "Aucune permission";
  const text = names.join(", ");
  return text.length > 1010 ? `${text.slice(0, 1007)}...` : text;
}

function quoteContent(text: string | null | undefined): string {
  const value = text?.length ? text : "*Aucun contenu*";
  return `>>> ${value.slice(0, 1000)}`;
}

export function memberAuthorLine(user: User): string {
  return user.discriminator === "0" ? `@${user.username}` : user.tag;
}

function moderatorField(moderator: User): string {
  const tag = moderator.discriminator === "0" ? `@${moderator.username}` : moderator.tag;
  return `> ${moderator} \`${tag}\``;
}

function formatMemberRoles(roleIds: string[]): string {
  if (!roleIds.length) return "> Aucun rôle";
  return `> ${roleIds.map((id) => `<@&${id}>`).join(", ")}`;
}

// ---------------------------------------------------------------------------
// Builders d'embeds
// ---------------------------------------------------------------------------

export function buildMemberJoinEmbed(member: GuildMember): EmbedBuilder {
  const user = member.user;
  const created = Math.floor(user.createdTimestamp / 1000);

  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setAuthor({
      name: memberAuthorLine(user),
      iconURL: user.displayAvatarURL({ size: 64 }),
      url: SUPPORT_URL,
    })
    .setTitle("Arrivée d'un membre")
    .setDescription(`${user} a rejoint le serveur.`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields({
      name: "Date de création du compte :",
      value: `> <t:${created}> (<t:${created}:R>)`,
    })
    .setFooter({ text: `ID de l'utilisateur : ${user.id}` })
    .setTimestamp();
}

export function buildMemberLeaveEmbed(
  member: GuildMember | PartialGuildMember,
  roleIds: string[]
): EmbedBuilder {
  const user = member.user;
  const joined = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  const fields: { name: string; value: string }[] = [];
  if (joined) {
    fields.push({
      name: "Avait rejoint le serveur :",
      value: `> <t:${joined}> (<t:${joined}:R>)`,
    });
  }
  fields.push({ name: "Rôles de l'utilisateur :", value: formatMemberRoles(roleIds) });

  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({
      name: memberAuthorLine(user),
      iconURL: user.displayAvatarURL({ size: 64 }),
      url: SUPPORT_URL,
    })
    .setTitle("Départ d'un membre")
    .setDescription(`${user} a quitté le serveur.`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(fields)
    .setFooter({ text: `ID de l'utilisateur : ${user.id}` })
    .setTimestamp();
}

export function buildRoleCreateEmbed(role: Role): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("Création d'un rôle")
    .setDescription(`Rôle créé : ${role} \`${role.name}\`.`)
    .addFields(
      { name: "Style et couleur :", value: `> ${formatRoleStyle(role)}` },
      { name: "Permissions :", value: `> ${formatRolePermissionsLog(role)}` }
    )
    .setFooter({ text: `ID du rôle : ${role.id}` })
    .setTimestamp(role.createdTimestamp);
}

export function buildRoleDeleteEmbed(role: Role): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle("Suppression d'un rôle")
    .setDescription(`Rôle supprimé : \`${role.name}\`.`)
    .addFields(
      { name: "Style et couleur :", value: `> ${formatRoleStyle(role)}` },
      { name: "Rôle affiché séparément :", value: `> ${role.hoist ? "Oui" : "Non"}` },
      { name: "Rôle mentionnable :", value: `> ${role.mentionable ? "Oui" : "Non"}` },
      { name: "Permissions :", value: `> ${formatRolePermissionsLog(role)}` }
    )
    .setFooter({ text: `ID du rôle : ${role.id}` })
    .setTimestamp();
}

export function buildChannelCreateEmbed(channel: GuildBasedChannel): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle("Création d'un salon")
    .setDescription(`Salon créé : ${channel} \`${channel.name}\`.`)
    .setFooter({ text: `ID du salon : ${channel.id}` })
    .setTimestamp(channel.createdTimestamp ?? Date.now());
}

export function buildChannelDeleteEmbed(channel: { id: string; name: string }): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle("Suppression d'un salon")
    .setDescription(`Salon supprimé : \`${channel.name}\`.`)
    .setFooter({ text: `ID du salon : ${channel.id}` })
    .setTimestamp();
}

export function buildMessageDeleteEmbed(message: Message): EmbedBuilder {
  const author = message.author;
  const channel = message.channel;

  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({
      name: memberAuthorLine(author),
      iconURL: author.displayAvatarURL({ size: 64 }),
      url: SUPPORT_URL,
    })
    .setTitle("Message supprimé")
    .setDescription(`Un message de ${author} a été supprimé.`)
    .addFields(
      {
        name: "Salon :",
        value: `> ${channel} \`${"name" in channel ? channel.name : channel.id}\``,
      },
      { name: "Contenu :", value: quoteContent(message.content) }
    )
    .setFooter({ text: `ID du message : ${message.id}` })
    .setTimestamp();
}

export function buildMessageUpdateEmbed(oldContent: string | null, newMessage: Message): EmbedBuilder {
  const author = newMessage.author;
  const channel = newMessage.channel;
  const link = `https://discord.com/channels/${newMessage.guildId}/${channel.id}/${newMessage.id}`;

  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setAuthor({
      name: memberAuthorLine(author),
      iconURL: author.displayAvatarURL({ size: 64 }),
      url: SUPPORT_URL,
    })
    .setTitle("Message modifié")
    .setDescription(`${author} a modifié [un message](${link}).`)
    .addFields(
      {
        name: "Salon :",
        value: `> ${channel} \`${"name" in channel ? channel.name : channel.id}\``,
      },
      { name: "Ancien contenu :", value: quoteContent(oldContent) },
      { name: "Nouveau contenu :", value: quoteContent(newMessage.content) }
    )
    .setFooter({ text: `ID du message : ${newMessage.id}` })
    .setTimestamp();
}

export function buildModerationEmbed(
  title: string,
  pastParticiple: string,
  targetUser: User,
  moderator: User,
  reason: string | null | undefined
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({
      name: memberAuthorLine(targetUser),
      iconURL: targetUser.displayAvatarURL({ size: 64 }),
      url: SUPPORT_URL,
    })
    .setTitle(title)
    .setDescription(`${targetUser} a été ${pastParticiple} du serveur.`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Modérateur :", value: moderatorField(moderator) },
      { name: "Raison :", value: quoteContent(reason) }
    )
    .setFooter({ text: `ID de l'utilisateur : ${targetUser.id}` })
    .setTimestamp();
}

// ---------------------------------------------------------------------------
// Helpers de log réutilisables par les autres agents (modération / antiraid)
// ---------------------------------------------------------------------------

/** Loggue le départ d'un membre (catégorie "members"). */
export function sendMemberLeaveLog(guild: Guild, member: GuildMember | PartialGuildMember): void {
  if (member.user.bot) return;

  const roleIds =
    member instanceof GuildMember
      ? member.roles.cache.filter((r) => r.id !== guild.id).map((r) => r.id)
      : [];
  memberRoleSnapshots.set(`${guild.id}:${member.id}`, roleIds);

  enqueueLogMessage(guild, "members", buildMemberLeaveEmbed(member, roleIds));
}

/** Loggue un bannissement manuel (catégorie "moderation"). */
export function logModerationBan(
  guild: Guild,
  targetUser: User,
  moderator: User,
  reason?: string | null
): void {
  enqueueLogEmbed(
    guild,
    "moderation",
    buildModerationEmbed("Bannissement", "banni", targetUser, moderator, reason)
  );
}

/** Loggue une expulsion manuelle (catégorie "moderation"). */
export function logModerationKick(
  guild: Guild,
  targetUser: User,
  moderator: User,
  reason?: string | null
): void {
  enqueueLogEmbed(
    guild,
    "moderation",
    buildModerationEmbed("Expulsion", "expulsé", targetUser, moderator, reason)
  );
}

/** Loggue une sanction automatique de l'antiraid (catégorie "antiraid", modérateur = le bot). */
export function logAntiraidModeration(
  guild: Guild,
  botUser: User,
  title: string,
  pastParticiple: string,
  targetUser: User,
  reason?: string | null
): void {
  const embed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({
      name: botUser.username,
      url: SUPPORT_URL,
      iconURL: botUser.displayAvatarURL({ size: 64 }),
    })
    .setTitle(title)
    .setDescription(`${targetUser} a été ${pastParticiple} du serveur.`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Modérateur :", value: moderatorField(botUser) },
      { name: "Raison :", value: quoteContent(reason) }
    )
    .setFooter({ text: `ID de l'utilisateur : ${targetUser.id}` })
    .setTimestamp();

  enqueueLogEmbed(guild, "antiraid", embed);
}
