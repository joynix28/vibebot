import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";
import { getProtectConfig, saveProtectConfig } from "../func/db.ts";
import { needGuild, replyErr, hasPerm, logMod } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("raidmode")
  .setDescription("Activer ou désactiver le mode raid (bloque les nouveaux arrivants).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.Administrator)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Administrateur**.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  cfg.raidmode = !cfg.raidmode;
  saveProtectConfig(guild.id, cfg);
  await interaction.reply({
    components: [okPanel(`✅ **Mode raid ${cfg.raidmode ? "activé" : "désactivé"}.**`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🚨 Mode raid **${cfg.raidmode ? "activé" : "désactivé"}** par ${interaction.user} (\`${interaction.user.id}\`).`);
}
