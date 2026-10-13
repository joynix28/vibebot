import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, okPanel, panel, textBlock } from "../../../core/ui.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  hasPerm,
  needGuild,
  parseCancel,
  replyErr,
  resolveGuildChannel,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("role-react")
  .setDescription("Créer un rôle-réaction sur un message (réagir = recevoir le rôle).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) => o.setName("emoji").setDescription("Émoji à associer au rôle.").setRequired(true))
  .addRoleOption((o) => o.setName("role").setDescription("Rôle à associer.").setRequired(true))
  .addStringOption((o) => o.setName("message_id").setDescription("ID du message ciblé.").setRequired(true))
  .addChannelOption((o) =>
    o
      .setName("salon")
      .setDescription("Salon du message (défaut : salon actuel).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

const CMD = "role-react";

interface PendingRoleReact {
  authorId: string;
  ts: number;
  guildId: string;
  channelId: string;
  messageId: string;
  roleId: string;
  emoji: string;
}

const pending = new Map<string, PendingRoleReact>();

/** Registre en mémoire des rôles-réactions : `${guildId}:${messageId}` -> [{ emoji, roleId }]. */
const registry = new Map<string, { emoji: string; roleId: string }[]>();

/**
 * Résout le rôle associé à une réaction (utilisé par l'écouteur messageReactionAdd).
 * Compare l'émoji brut, son nom et son identifiant (`<:nom:id>`).
 */
export function resolveRoleReact(
  guildId: string,
  messageId: string,
  emojiName: string | null,
  emojiIdentifier: string
): string | null {
  const entries = registry.get(`${guildId}:${messageId}`);
  if (!entries) return null;
  for (const e of entries) {
    if (e.emoji === emojiName || e.emoji === emojiIdentifier) return e.roleId;
  }
  return null;
}

function nonce(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.Administrator)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Administrateur**.");
    return;
  }
  const emoji = interaction.options.getString("emoji", true).trim();
  const roleOpt = interaction.options.getRole("role", true);
  const role = guild.roles.cache.get(roleOpt.id);
  if (!role) {
    await replyErr(interaction, "❌ Rôle introuvable.");
    return;
  }
  const messageId = interaction.options.getString("message_id", true).trim();
  const channel = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);

  if (role.managed) {
    await replyErr(interaction, `❌ Le rôle ${role} est un rôle d'intégration.`);
    return;
  }
  const me = guild.members.me;
  if (!me || me.roles.highest.position <= role.position || !role.editable) {
    await replyErr(interaction, `❌ Je ne peux pas attribuer le rôle ${role} (hiérarchie).`);
    return;
  }
  if (!channel || !channel.isTextBased()) {
    await replyErr(interaction, "❌ Salon invalide.");
    return;
  }
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    await replyErr(interaction, "❌ Message introuvable dans ce salon.");
    return;
  }
  try {
    await message.react(emoji).then((r) => r.remove());
  } catch {
    await replyErr(interaction, "❌ Émoji invalide ou inaccessible.");
    return;
  }

  const key = nonce();
  pending.set(key, {
    authorId: interaction.user.id,
    ts: Date.now(),
    guildId: guild.id,
    channelId: channel.id,
    messageId: message.id,
    roleId: role.id,
    emoji,
  });
  setTimeout(() => pending.delete(key), 120_000);

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `# 🎭 Rôle-réaction\n**Émoji :** ${emoji}\n**Rôle :** ${role}\n**Salon :** ${channel}\n**Message :** ${message.url}\n\nCréer ce rôle-réaction ?`
          ),
        ],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, key),
    ],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const cancelAuthor = parseCancel(interaction.customId, CMD);
  if (cancelAuthor) {
    if (!(await checkAuthor(interaction, cancelAuthor))) return;
    await interaction.update({ components: [] });
    return;
  }

  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "confirm") return;
  const key = parts[4];
  const p = key ? pending.get(key) : undefined;
  if (!p || p.guildId !== guild.id) {
    await replyErr(interaction, "❌ Confirmation expirée ou invalide. Relancez la commande.");
    return;
  }
  if (!(await checkAuthor(interaction, p.authorId))) return;
  if (!(await checkFresh(interaction, p.ts))) {
    pending.delete(key as string);
    return;
  }

  const regKey = `${p.guildId}:${p.messageId}`;
  const entries = registry.get(regKey) ?? [];
  if (entries.some((e) => e.emoji === p.emoji)) {
    pending.delete(key as string);
    await replyErr(interaction, "❌ Cet émoji est déjà utilisé pour un rôle-réaction sur ce message.");
    return;
  }

  const channel = guild.channels.cache.get(p.channelId);
  const message = channel?.isTextBased() ? await channel.messages.fetch(p.messageId).catch(() => null) : null;
  if (!message) {
    pending.delete(key as string);
    await replyErr(interaction, "❌ Message introuvable.");
    return;
  }

  try {
    await message.react(p.emoji);
  } catch {
    pending.delete(key as string);
    await replyErr(interaction, "❌ Impossible d'ajouter la réaction (émoji invalide ou permissions).");
    return;
  }
  entries.push({ emoji: p.emoji, roleId: p.roleId });
  registry.set(regKey, entries);
  pending.delete(key as string);

  await interaction.update({ components: [] });
  await interaction.followUp({
    components: [okPanel(`✅ Rôle-réaction créé : ${p.emoji} → <@&${p.roleId}> sur [ce message](${message.url}).`)],
    flags: FLAGS_V2,
  });
}
