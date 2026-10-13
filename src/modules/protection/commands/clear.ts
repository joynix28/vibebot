import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, errPanel, okPanel } from "../../../core/ui.ts";
import { hasPerm, logMod, needGuild, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("Supprimer des messages du salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) =>
    o.setName("nombre").setDescription("Nombre de messages à supprimer (1 à 100).").setRequired(true).setMinValue(1).setMaxValue(100)
  )
  .addUserOption((o) => o.setName("utilisateur").setDescription("Ne supprimer que les messages de cet utilisateur."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les messages**.");
    return;
  }
  const channel = resolveGuildChannel(guild, interaction.channelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await replyErr(interaction, "❌ Cette commande ne fonctionne que dans un salon textuel.");
    return;
  }
  const me = guild.members.me;
  if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageMessages)) {
    await replyErr(interaction, "❌ Je n'ai pas la permission de gérer les messages dans ce salon.");
    return;
  }
  const amount = interaction.options.getInteger("nombre", true);
  const user = interaction.options.getUser("utilisateur");

  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
  try {
    const reply = await interaction.fetchReply();
    const messages = await channel.messages.fetch({ limit: amount, before: reply.id });
    const targets = user ? messages.filter((m) => m.author.id === user.id) : messages;
    const deleted = await channel.bulkDelete(targets, true);
    const suffix = user ? ` de ${user}` : "";
    await interaction.editReply({
      components: [okPanel(`✅ **${deleted.size}** message${deleted.size > 1 ? "s" : ""} supprimé${deleted.size > 1 ? "s" : ""}${suffix}.`)],
      flags: FLAGS_V2,
    });
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
    await logMod(
      guild,
      `🧹 **Clear** — ${deleted.size} message(s)${suffix} supprimé(s) dans ${channel} par ${interaction.user} (\`${interaction.user.id}\`).`
    );
  } catch {
    await interaction
      .editReply({ components: [errPanel("❌ Impossible de supprimer les messages dans ce salon.")], flags: FLAGS_V2 })
      .catch(() => {});
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000);
  }
}
