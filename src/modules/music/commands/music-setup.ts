import { PermissionFlagsBits } from "discord.js";
import type { GuildMember } from "discord.js";
import type { HubInteraction } from "./_hub.ts";
import { FLAGS_V2_EPHEMERAL, errPanel, msgPanel, okPanel, BLUE, GREEN } from "../../../core/ui.ts";
import { getSettings, saveSettings } from "../func/db.ts";
import type { SettingsPatch } from "../func/db.ts";

export function configPanel(guildId: string, title: string, accent: number) {
  const s = getSettings(guildId);
  return msgPanel(
    `## ${title}\n\n` +
      `> **Rôle DJ :** ${s.dj_role ? `<@&${s.dj_role}>` : "_aucun_"}\n` +
      `> **Salon texte :** ${s.text_channel ? `<#${s.text_channel}>` : "_aucun_"}\n` +
      `> **Salon vocal :** ${s.voice_channel ? `<#${s.voice_channel}>` : "_aucun_"}\n` +
      `> **Volume par défaut :** \`${s.default_volume}%\`\n` +
      `> **Votes pour passer :** \`${s.skip_percent}% des auditeurs\`\n` +
      `> **Délai d'inactivité :** \`${s.stay_time}s\``,
    accent
  );
}

/** Affiche la config si patch est null/vide, sinon applique le patch. */
export async function runMusicSetup(interaction: HubInteraction, patch: SettingsPatch | null): Promise<void> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      components: [errPanel("⛔ Cette commande nécessite la permission **Gérer le serveur**.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (!patch || Object.keys(patch).length === 0) {
    await interaction.reply({ components: [configPanel(guild.id, "⚙️ Configuration musique", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  saveSettings(guild.id, patch);
  await interaction.reply({
    components: [
      okPanel("✅ Configuration musique mise à jour."),
      configPanel(guild.id, "⚙️ Configuration actuelle", GREEN),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
