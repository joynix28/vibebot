import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, okPanel, panel, textBlock } from "../../../core/ui.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  isOwnerOrWhitelisted,
  logMod,
  needGuild,
  parseCancel,
  parseConfirm,
  replyErr,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("clear-roles")
  .setDescription("Supprimer tous les rôles portant le même nom qu'un rôle donné.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((o) =>
    o.setName("role").setDescription("Rôle dont le nom servira de filtre.").setRequired(true)
  );

const CMD = "clear-roles";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const role = interaction.options.getRole("role", true);
  const targets = guild.roles.cache.filter(
    (r) => r.name === role.name && r.id !== guild.id && !r.managed && r.editable
  );
  if (!targets.size) {
    await replyErr(interaction, "❌ Aucun rôle supprimable trouvé avec ce nom.");
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🗑️ Clear roles\nSupprimer **${targets.size} rôle${targets.size > 1 ? "s" : ""}** nommé \`${role.name}\` ?\n⚠️ *Action irréversible.*`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, role.id),
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
    return;
  }

  const info = parseConfirm(interaction.customId, CMD);
  if (!info) return;
  if (!(await checkAuthor(interaction, info.authorId))) return;
  if (!(await checkFresh(interaction, info.ts))) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }

  const ref = info.extra[0] ? guild.roles.cache.get(info.extra[0]) : null;
  const name = ref?.name;
  if (!name) {
    await replyErr(interaction, "❌ Rôle de référence introuvable.");
    return;
  }
  const targets = guild.roles.cache.filter(
    (r) => r.name === name && r.id !== guild.id && !r.managed && r.editable
  );
  await interaction.update({ components: [] });

  let count = 0;
  for (const r of targets.values()) {
    try {
      await r.delete(`Clear-roles demandé par @${interaction.user.username}`);
      count++;
    } catch {
      // ignore
    }
  }
  await interaction.followUp({
    components: [okPanel(`✅ **${count}** rôle${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🗑️ **Clear-roles** — ${count} rôle(s) nommé(s) \`${name}\` supprimé(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
