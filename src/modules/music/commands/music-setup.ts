import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, errPanel, msgPanel, okPanel, BLUE, GREEN } from "../../../core/ui.ts";
import { getSettings, saveSettings } from "../func/db.ts";
import type { SettingsPatch } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("music-setup")
  .setDescription("Configure le module musique (rôle DJ, salons, volume, votes).")
  .addRoleOption((o) => o.setName("role-dj").setDescription("Rôle DJ (contrôle complet du lecteur)."))
  .addChannelOption((o) =>
    o
      .setName("salon-texte")
      .setDescription("Salon texte dédié aux commandes musique.")
      .addChannelTypes(ChannelType.GuildText)
  )
  .addChannelOption((o) =>
    o
      .setName("salon-vocal")
      .setDescription("Salon vocal dédié à la musique.")
      .addChannelTypes(ChannelType.GuildVoice)
  )
  .addIntegerOption((o) =>
    o.setName("volume-defaut").setDescription("Volume par défaut (0-100).").setMinValue(0).setMaxValue(100)
  )
  .addIntegerOption((o) =>
    o.setName("pourcentage-skip").setDescription("% d'auditeurs requis pour passer un morceau (10-100).").setMinValue(10).setMaxValue(100)
  )
  .addIntegerOption((o) =>
    o.setName("delai-inactivite").setDescription("Secondes avant de quitter après la fin de la file (0-600).").setMinValue(0).setMaxValue(600)
  );

function configPanel(guildId: string, title: string, accent: number) {
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const patch: SettingsPatch = {};
  let changed = false;

  const djRole = interaction.options.getRole("role-dj");
  if (djRole) {
    patch.dj_role = djRole.id;
    changed = true;
  }
  const textCh = interaction.options.getChannel("salon-texte");
  if (textCh) {
    patch.text_channel = textCh.id;
    changed = true;
  }
  const voiceCh = interaction.options.getChannel("salon-vocal");
  if (voiceCh) {
    patch.voice_channel = voiceCh.id;
    changed = true;
  }
  const vol = interaction.options.getInteger("volume-defaut");
  if (vol !== null) {
    patch.default_volume = vol;
    changed = true;
  }
  const skipPct = interaction.options.getInteger("pourcentage-skip");
  if (skipPct !== null) {
    patch.skip_percent = skipPct;
    changed = true;
  }
  const stay = interaction.options.getInteger("delai-inactivite");
  if (stay !== null) {
    patch.stay_time = stay;
    changed = true;
  }

  if (!changed) {
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
