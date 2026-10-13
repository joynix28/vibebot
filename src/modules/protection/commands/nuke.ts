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
  parseConfirm,
  replyErr,
  resolveGuildChannel,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("nuke")
  .setDescription("Supprimer puis recréer un salon (nettoyage total).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addChannelOption((o) =>
    o
      .setName("salon")
      .setDescription("Salon à recréer (défaut : salon actuel).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)
  );

const CMD = "nuke";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageChannels)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les salons**.");
    return;
  }
  const channel = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!channel || channel.isThread() || !("clone" in channel)) {
    await replyErr(interaction, "❌ Ce type de salon ne peut pas être recréé.");
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# ☢️ Nuke\n**${channel}** va être supprimé puis recréé à l'identique.\n⚠️ *Tous les messages seront définitivement perdus.*`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, channel.id),
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
    await interaction.followUp({
      components: [okPanel("❌ Nuke annulé.")],
      flags: FLAGS_V2,
    }).catch(() => {});
    return;
  }

  const info = parseConfirm(interaction.customId, CMD);
  if (!info) return;
  if (!(await checkAuthor(interaction, info.authorId))) return;
  if (!(await checkFresh(interaction, info.ts))) return;

  const channelId = info.extra[0];
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel || !("clone" in channel) || typeof channel.clone !== "function") {
    await replyErr(interaction, "❌ Salon introuvable.");
    return;
  }

  await interaction.update({ components: [] });
  try {
    const cloned = await channel.clone({ reason: `Nuke demandé par @${interaction.user.username}` });
    await channel.delete(`Nuke demandé par @${interaction.user.username}`);
    if (cloned.isTextBased()) {
      await cloned.send({ components: [okPanel("☢️ **Salon recréé avec succès.**")], flags: FLAGS_V2 });
    }
  } catch (err) {
    await interaction
      .followUp({
        components: [okPanel(`❌ Échec du nuke : ${err instanceof Error ? err.message : "erreur inconnue"}`)],
        flags: FLAGS_V2,
      })
      .catch(() => {});
  }
}
