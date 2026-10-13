import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel } from "../../../core/ui.ts";
import { hasPerm, needGuild, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("say")
  .setDescription("Faire parler le bot dans un salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) => o.setName("texte").setDescription("Message à envoyer.").setRequired(true).setMaxLength(2000))
  .addChannelOption((o) =>
    o
      .setName("salon")
      .setDescription("Salon d'envoi (défaut : salon actuel).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les messages**.");
    return;
  }
  const text = interaction.options.getString("texte", true);
  const target = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!target || !target.isTextBased()) {
    await replyErr(interaction, "❌ Salon d'envoi invalide.");
    return;
  }
  try {
    await target.send({ content: text });
  } catch (err) {
    await replyErr(interaction, `❌ Échec de l'envoi : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ Message envoyé dans ${target}.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
