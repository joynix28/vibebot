import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, msgPanel, okPanel, panel, textBlock } from "../../../core/ui.ts";
import { getProtectConfig } from "../func/db.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  hasPerm,
  logMod,
  needGuild,
  parseCancel,
  parseConfirm,
  replyErr,
} from "./_shared.ts";
export const data = new SlashCommandBuilder()
  .setName("unmute-all")
  .setDescription("Rendre la parole à tous les membres muets du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const CMD = "unmute-all";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.Administrator)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Administrateur**.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  const muted = guild.members.cache.filter(
    (m) => m.isCommunicationDisabled() || (cfg.muteRole !== null && m.roles.cache.has(cfg.muteRole))
  );
  if (!muted.size) {
    await interaction.reply({
      components: [msgPanel("ℹ️ Aucun membre n'est actuellement muet.", BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🔊 Unmute-all\nRendre la parole à **${muted.size}** membre${muted.size > 1 ? "s" : ""} muet${muted.size > 1 ? "s" : ""} ?`)],
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
  const authorMember = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!authorMember?.permissions.has(PermissionFlagsBits.Administrator)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Administrateur**.");
    return;
  }

  const cfg = getProtectConfig(guild.id);
  const muted = guild.members.cache.filter(
    (m) => m.isCommunicationDisabled() || (cfg.muteRole !== null && m.roles.cache.has(cfg.muteRole))
  );
  await interaction.update({ components: [] });

  let count = 0;
  for (const member of muted.values()) {
    try {
      if (member.isCommunicationDisabled()) {
        await member.timeout(null, `Unmute-all demandé par @${interaction.user.username}`);
      }
      if (cfg.muteRole && member.roles.cache.has(cfg.muteRole)) {
        await member.roles.remove(cfg.muteRole, `Unmute-all demandé par @${interaction.user.username}`);
      }
      count++;
    } catch {
      // ignore
    }
  }
  await interaction.followUp({
    components: [okPanel(`✅ **${count}** membre${count > 1 ? "s" : ""} démute${count > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🔊 **Unmute-all** — ${count} membre(s) démute(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
