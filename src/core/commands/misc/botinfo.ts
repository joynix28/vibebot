import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, FLAGS_V2, BLUE } from "../../ui.ts";
import { loadModuleMetas } from "../../loader.ts";

export const data = new SlashCommandBuilder()
  .setName("botinfo")
  .setDescription("Affiche les informations du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client;
  const metas = await loadModuleMetas();
  const uptime = Math.floor((Date.now() - (client.uptime ? Date.now() - client.uptime : Date.now())) / 1000);

  const body =
    `# Fusion Bot\n\n` +
    `> **Serveurs :** \`${client.guilds.cache.size}\`\n` +
    `> **Utilisateurs :** \`${client.guilds.cache.reduce((a, g) => a + (g.memberCount ?? 0), 0)}\`\n` +
    `> **Commandes :** \`${client.commands.size}\`\n` +
    `> **Modules :** \`${metas.length}\` (${metas.map((m) => `${m.emoji} ${m.name}`).join(", ")})\n` +
    `> **Latence :** \`${Math.round(client.ws.ping)}ms\`\n` +
    `> **Uptime :** <t:${Math.floor(Date.now() / 1000) - Math.floor((client.uptime ?? 0) / 1000)}:R>\n\n` +
    `*Propulsé par discord.js v14 — un seul bot pour tout.*`;

  await interaction.reply({ components: [panel([textBlock(body)], BLUE)], flags: FLAGS_V2 });
}
