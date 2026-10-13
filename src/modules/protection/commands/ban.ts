import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { addTempban } from "../func/db.ts";
import { logCase } from "../func/cases.ts";
import { authorHighestPosition, formatDuration, hasPerm, logMod, needGuild, parseDuration, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Bannir un utilisateur du serveur (optionnel : bannissement temporaire).")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
  .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur à bannir.").setRequired(true))
  .addStringOption((o) => o.setName("raison").setDescription("Raison du bannissement."))
  .addStringOption((o) =>
    o.setName("duree").setDescription("Durée du bannissement temporaire (ex : 30m, 2h, 1d, 1w).")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.BanMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Bannir des membres**.");
    return;
  }
  const user = interaction.options.getUser("utilisateur", true);
  const reason = interaction.options.getString("raison") ?? "Aucune raison fournie";
  const dureeRaw = interaction.options.getString("duree");

  let tempMs: number | null = null;
  if (dureeRaw) {
    tempMs = parseDuration(dureeRaw);
    if (!tempMs || tempMs <= 0) {
      await replyErr(interaction, "❌ Durée invalide. Exemples : `30m`, `2h`, `1d`, `1w`.");
      return;
    }
  }

  const existing = await guild.bans.fetch(user.id).catch(() => null);
  if (existing) {
    await replyErr(interaction, `❌ ${user} est déjà banni du serveur.`);
    return;
  }
  const member = guild.members.cache.get(user.id);
  if (member && !member.bannable) {
    await replyErr(interaction, `❌ Je n'ai pas la permission de bannir ${member}.`);
    return;
  }
  const authorHighest = await authorHighestPosition(guild, interaction.user.id);
  if (member && guild.ownerId !== interaction.user.id && member.roles.highest.position >= authorHighest) {
    await replyErr(interaction, "❌ Vous ne pouvez pas bannir un membre de rang égal ou supérieur au vôtre.");
    return;
  }
  if (user.id === guild.ownerId) {
    await replyErr(interaction, "❌ Vous ne pouvez pas bannir le propriétaire du serveur.");
    return;
  }

  try {
    await guild.bans.create(user, { reason: `[@${interaction.user.username}] ${reason}` });
  } catch (err) {
    await replyErr(interaction, `❌ Échec du bannissement : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    return;
  }

  if (tempMs) addTempban(guild.id, user.id, Date.now() + tempMs);
  logCase(guild.id, user.id, "ban", reason, interaction.user.id);

  const label = tempMs ? `a été banni pendant **${formatDuration(tempMs)}**` : "a été banni définitivement";
  await interaction.reply({
    components: [okPanel(`✅ ${user} ${label} du serveur.`)],
    flags: FLAGS_V2,
  });
  await logMod(
    guild,
    `🔨 **Ban${tempMs ? " temporaire" : ""}** — ${user.tag} (\`${user.id}\`) par ${interaction.user} (\`${interaction.user.id}\`)${tempMs ? ` — durée : ${formatDuration(tempMs)}` : ""} — *${reason}*`
  );
}
