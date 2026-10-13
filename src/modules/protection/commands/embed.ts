import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, actionRow, button, okPanel, panel, textBlock } from "../../../core/ui.ts";
import { ButtonStyle } from "discord.js";
import { BLURPLE, checkAuthor, hasPerm, needGuild, parseCancel, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("embed")
  .setDescription("Créer un embed et l'envoyer avec le bot (avec prévisualisation).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) => o.setName("titre").setDescription("Titre de l'embed.").setRequired(true).setMaxLength(256))
  .addStringOption((o) => o.setName("description").setDescription("Description de l'embed.").setRequired(true).setMaxLength(4000))
  .addStringOption((o) =>
    o
      .setName("couleur")
      .setDescription("Couleur de l'embed.")
      .addChoices(
        { name: "Blurple", value: "5865f2" },
        { name: "Bleu", value: "3498db" },
        { name: "Vert", value: "2ecc71" },
        { name: "Rouge", value: "e74c3c" },
        { name: "Or", value: "f1c40f" },
        { name: "Noir", value: "2b2d31" }
      )
  )
  .addChannelOption((o) =>
    o
      .setName("salon")
      .setDescription("Salon d'envoi (défaut : salon actuel).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

const CMD = "embed";

interface PendingEmbed {
  authorId: string;
  title: string;
  description: string;
  color: number;
  channelId: string;
}

const pending = new Map<string, PendingEmbed>();

function nonce(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les messages**.");
    return;
  }
  const title = interaction.options.getString("titre", true);
  const description = interaction.options.getString("description", true);
  const color = parseInt(interaction.options.getString("couleur") ?? "5865f2", 16);
  const target = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!target || !target.isTextBased()) {
    await replyErr(interaction, "❌ Salon d'envoi invalide.");
    return;
  }

  const key = nonce();
  pending.set(key, { authorId: interaction.user.id, title, description, color, channelId: target.id });
  setTimeout(() => pending.delete(key), 300_000);

  const preview = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color);
  await interaction.reply({
    components: [
      panel([textBlock(`# 🎨 Aperçu de l'embed\nDestination : ${target}`)], BLURPLE),
      actionRow(
        button(`${CMD}:publish:${key}`, "Publier", ButtonStyle.Success, "📤"),
        button(`${CMD}:cancel:${interaction.user.id}`, "Annuler", ButtonStyle.Secondary, "❌")
      ),
    ],
    embeds: [preview],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;

  const cancelAuthor = parseCancel(interaction.customId, CMD);
  if (cancelAuthor) {
    if (!(await checkAuthor(interaction, cancelAuthor))) return;
    await interaction.update({ components: [] });
    return;
  }

  if (parts[1] !== "publish") return;
  const p = parts[2] ? pending.get(parts[2]) : undefined;
  if (!p) {
    await replyErr(interaction, "❌ Prévisualisation expirée. Relancez la commande.");
    return;
  }
  if (!(await checkAuthor(interaction, p.authorId))) return;

  const target = guild.channels.cache.get(p.channelId);
  if (!target || !target.isTextBased()) {
    pending.delete(parts[2] as string);
    await replyErr(interaction, "❌ Salon d'envoi introuvable.");
    return;
  }
  const embed = new EmbedBuilder().setTitle(p.title).setDescription(p.description).setColor(p.color);
  try {
    await target.send({ embeds: [embed] });
  } catch (err) {
    await replyErr(interaction, `❌ Échec de l'envoi : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  pending.delete(parts[2] as string);
  await interaction.update({ components: [okPanel(`✅ Embed publié dans ${target}.`)] });
}
