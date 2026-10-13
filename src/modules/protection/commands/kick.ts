import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { authorHighestPosition, hasPerm, logMod, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Expulser un membre du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addUserOption((o) => o.setName("membre").setDescription("Membre à expulser.").setRequired(true))
  .addStringOption((o) => o.setName("raison").setDescription("Raison de l'expulsion."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.KickMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Expulser des membres**.");
    return;
  }
  const user = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await replyErr(interaction, "❌ Cet utilisateur n'est pas membre du serveur.");
    return;
  }
  if (!member.kickable) {
    await replyErr(interaction, `❌ Je n'ai pas la permission d'expulser ${member}.`);
    return;
  }
  const authorHighest = await authorHighestPosition(guild, interaction.user.id);
  if (guild.ownerId !== interaction.user.id && member.roles.highest.position >= authorHighest) {
    await replyErr(interaction, "❌ Vous ne pouvez pas expulser un membre de rang égal ou supérieur au vôtre.");
    return;
  }

  try {
    await member.kick(`[@${interaction.user.username}] ${reason}`);
  } catch (err) {
    await replyErr(interaction, `❌ Échec de l'expulsion : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ ${user} a été expulsé du serveur.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `👢 **Kick** — ${user.tag} (\`${user.id}\`) par ${interaction.user} (\`${interaction.user.id}\`) — *${reason}*`);
}
