import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { clearTempban } from "../func/db.ts";
import { hasPerm, logMod, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Révoquer le bannissement d'un utilisateur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur à débannir.").setRequired(true))
  .addStringOption((o) => o.setName("raison").setDescription("Raison du débannissement."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.BanMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Bannir des membres**.");
    return;
  }
  const user = interaction.options.getUser("utilisateur", true);
  const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";

  const ban = await guild.bans.fetch(user.id).catch(() => null);
  if (!ban) {
    await replyErr(interaction, `❌ ${user} n'est pas banni du serveur.`);
    return;
  }
  try {
    await guild.members.unban(user.id, `[@${interaction.user.username}] ${reason}`);
  } catch (err) {
    await replyErr(interaction, `❌ Échec du débannissement : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  clearTempban(guild.id, user.id);
  await interaction.reply({
    components: [okPanel(`✅ ${user} a été débanni du serveur.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🔓 **Unban** — ${user.tag} (\`${user.id}\`) par ${interaction.user} (\`${interaction.user.id}\`) — *${reason}*`);
}
