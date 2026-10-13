import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { FLAGS_V2_EPHEMERAL, errPanel, okPanel } from "../func/ui.ts";
import { getLogsConfig, saveLogsConfig, type LogsConfig } from "../func/db.ts";

// Configuration des salons de logs, stockée en JSON dans `legacy_logs`
// (migration de la DB JSON par serveur du bot legacy).

const LOG_KEYS: { key: string; label: string }[] = [
  { key: "moderation", label: "Modération" },
  { key: "messages", label: "Messages" },
  { key: "arrivees", label: "Arrivées" },
  { key: "departs", label: "Départs" },
  { key: "vocal", label: "Vocal" },
  { key: "salons", label: "Salons" },
  { key: "roles", label: "Rôles" },
];

export const data = (() => {
  const b = new SlashCommandBuilder()
    .setName("logs-config")
    .setDescription("Configure les salons de logs du serveur.");
  for (const { key, label } of LOG_KEYS) {
    b.addChannelOption((o) =>
      o
        .setName(key)
        .setDescription(`Salon des logs : ${label.toLowerCase()}.`)
        .addChannelTypes(ChannelType.GuildText)
    );
  }
  return b;
})();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Commande utilisable uniquement sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ components: [errPanel("Permission requise : Gérer le serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const cfg: LogsConfig = getLogsConfig(guild.id);
  let changed = false;
  for (const { key } of LOG_KEYS) {
    const ch = interaction.options.getChannel(key);
    if (ch) {
      cfg[key] = ch.id;
      changed = true;
    }
  }
  if (changed) saveLogsConfig(guild.id, cfg);

  const lines = LOG_KEYS.map(({ key, label }) => {
    const id = cfg[key];
    return `> **${label} :** ${id ? `<#${id}>` : "*non défini*"}`;
  });
  await interaction.reply({
    components: [
      okPanel(`# 📝 Configuration des logs\n${lines.join("\n")}`),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
