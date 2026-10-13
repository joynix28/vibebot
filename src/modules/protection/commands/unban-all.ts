import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, msgPanel, okPanel, panel, textBlock } from "../../../core/ui.ts";
import { clearTempban } from "../func/db.ts";
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
  .setName("unban-all")
  .setDescription("Révoquer tous les bannissements du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const CMD = "unban-all";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const bans = await guild.bans.fetch().catch(() => null);
  if (!bans || !bans.size) {
    await interaction.reply({
      components: [msgPanel("ℹ️ Aucun bannissement sur ce serveur.", BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🔓 Unban-all\nRévoquer les **${bans.size}** bannissements du serveur ?`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id),
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

  const bans = await guild.bans.fetch().catch(() => null);
  if (!bans || !bans.size) {
    await replyErr(interaction, "❌ Aucun bannissement à révoquer.");
    return;
  }
  await interaction.update({ components: [] });
  await interaction.followUp({
    components: [msgPanel(`ℹ️ Révocation de **${bans.size}** bannissements en cours...`, BLURPLE)],
    flags: FLAGS_V2,
  });

  let count = 0;
  for (const ban of bans.values()) {
    try {
      await guild.members.unban(ban.user.id, `Unban-all demandé par @${interaction.user.username}`);
      clearTempban(guild.id, ban.user.id);
      count++;
    } catch {
      // ignore
    }
  }
  await interaction.followUp({
    components: [okPanel(`✅ **${count}** bannissement${count > 1 ? "s" : ""} révoqué${count > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🔓 **Unban-all** — ${count} bannissement(s) révoqué(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
