import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { getProtectConfig } from "../func/db.ts";
import { hasPerm, logMod, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("unmute")
  .setDescription("Rendre la parole à un membre muet.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName("membre").setDescription("Membre à démuter.").setRequired(true))
  .addStringOption((o) => o.setName("raison").setDescription("Raison du démute."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ModerateMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Exclure temporairement des membres**.");
    return;
  }
  const user = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const cfg = getProtectConfig(guild.id);

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await replyErr(interaction, "❌ Cet utilisateur n'est pas membre du serveur.");
    return;
  }
  const hasMuteRole = cfg.muteRole !== null && member.roles.cache.has(cfg.muteRole);
  const hasTimeout = member.isCommunicationDisabled();
  if (!hasMuteRole && !hasTimeout) {
    await replyErr(interaction, `❌ ${member} n'est pas muet.`);
    return;
  }

  try {
    if (hasMuteRole && cfg.muteRole) {
      await member.roles.remove(cfg.muteRole, `[@${interaction.user.username}] ${reason}`);
    }
    if (hasTimeout) {
      await member.timeout(null, `[@${interaction.user.username}] ${reason}`);
    }
  } catch (err) {
    await replyErr(interaction, `❌ Échec du démute : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ ${member} peut de nouveau parler sur le serveur.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🔊 **Unmute** — ${user.tag} (\`${user.id}\`) par ${interaction.user} (\`${interaction.user.id}\`) — *${reason}*`);
}
