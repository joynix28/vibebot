import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, msgPanel, okPanel } from "../../../core/ui.ts";
import { BLURPLE, hasPerm, logMod, needGuild, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("unlock")
  .setDescription("Déverrouiller un salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addChannelOption((o) => o.setName("salon").setDescription("Salon à déverrouiller (défaut : salon actuel)."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageRoles)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les rôles**.");
    return;
  }
  const channel = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!channel || channel.isThread()) {
    await replyErr(interaction, "❌ Salon invalide.");
    return;
  }
  const everyone = guild.roles.everyone;
  if (channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages)) {
    await interaction.reply({
      components: [msgPanel(`ℹ️ ${channel} n'est pas verrouillé.`, BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  try {
    await channel.permissionOverwrites.edit(everyone, { SendMessages: true }, { reason: `Unlock demandé par @${interaction.user.username}` });
  } catch (err) {
    await replyErr(interaction, `❌ Échec du déverrouillage : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ ${channel} a été déverrouillé.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🔓 **Unlock** — ${channel} déverrouillé par ${interaction.user} (\`${interaction.user.id}\`).`);
}
