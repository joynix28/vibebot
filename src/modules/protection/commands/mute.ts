import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { getProtectConfig, saveProtectConfig } from "../func/db.ts";
import { logCase } from "../func/cases.ts";
import { authorHighestPosition, hasPerm, logMod, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("mute")
  .setDescription("Rendre muet un membre via le rôle muet.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption((o) => o.setName("membre").setDescription("Membre à rendre muet.").setRequired(true))
  .addStringOption((o) => o.setName("raison").setDescription("Raison du mute."))
  .addRoleOption((o) =>
    o.setName("role_mute").setDescription("Définir le rôle muet à utiliser (enregistré pour le serveur).")
  );

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

  const provided = interaction.options.getRole("role_mute");
  if (provided) {
    if (provided.managed) {
      await replyErr(interaction, `❌ Le rôle ${provided} est un rôle d'intégration.`);
      return;
    }
    cfg.muteRole = provided.id;
    saveProtectConfig(guild.id, cfg);
  }
  if (!cfg.muteRole) {
    await replyErr(interaction, "❌ Aucun rôle muet configuré. Utilisez l'option `role_mute` pour le définir.");
    return;
  }
  const muteRole = guild.roles.cache.get(cfg.muteRole);
  if (!muteRole) {
    await replyErr(interaction, "❌ Le rôle muet configuré n'existe plus. Redéfinissez-le avec l'option `role_mute`.");
    return;
  }
  const me = guild.members.me;
  if (!me || me.roles.highest.position <= muteRole.position || !muteRole.editable) {
    await replyErr(interaction, `❌ Je ne peux pas gérer le rôle muet ${muteRole} (hiérarchie).`);
    return;
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) {
    await replyErr(interaction, "❌ Cet utilisateur n'est pas membre du serveur.");
    return;
  }
  if (!member.manageable) {
    await replyErr(interaction, `❌ Je n'ai pas la permission de modifier ${member}.`);
    return;
  }
  const authorHighest = await authorHighestPosition(guild, interaction.user.id);
  if (guild.ownerId !== interaction.user.id && member.roles.highest.position >= authorHighest) {
    await replyErr(interaction, "❌ Vous ne pouvez pas rendre muet un membre de rang égal ou supérieur au vôtre.");
    return;
  }
  if (member.roles.cache.has(muteRole.id)) {
    await replyErr(interaction, `❌ ${member} est déjà muet.`);
    return;
  }

  try {
    await member.roles.add(muteRole, `[@${interaction.user.username}] ${reason}`);
  } catch (err) {
    await replyErr(interaction, `❌ Échec du mute : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ ${member} a été rendu muet (rôle ${muteRole}).`)],
    flags: FLAGS_V2,
  });
  logCase(guild.id, user.id, "mute", reason, interaction.user.id);
  await logMod(guild, `🔇 **Mute** — ${user.tag} (\`${user.id}\`) par ${interaction.user} (\`${interaction.user.id}\`) — *${reason}*`);
}
