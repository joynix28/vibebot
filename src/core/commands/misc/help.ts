import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { loadModuleMetas } from "../../loader.ts";
import { panel, textBlock, sepBlock, FLAGS_V2, actionRow, linkBtn, BLUE } from "../../ui.ts";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Affiche l'aide et la liste des modules du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const metas = await loadModuleMetas();
  const baseUrl = interaction.client.config.baseUrl;

  let body = `# Aide — Fusion Bot\n\n`;
  body += `Un seul bot pour tout ton serveur : sécurité, anti-raid, salons vocaux, backups, jeux et modération.\n\n`;

  for (const meta of metas) {
    const cmds = [...interaction.client.commands.values()]
      .filter((c) => (c as any).module === meta.id)
      .map((c) => `\`/${c.data.name}\``);
    body += `## ${meta.emoji} ${meta.name}\n${meta.description}\n`;
    if (cmds.length > 0) body += cmds.join(" ") + "\n";
    body += "\n";
  }

  const core = [...interaction.client.commands.values()].filter((c) => !(c as any).module);
  if (core.length > 0) {
    body += `## ✨ Générales\n` + core.map((c) => `\`/${c.data.name}\``).join(" ") + "\n";
  }

  body += `\n*Configure tout depuis le dashboard : ${baseUrl}*`;

  await interaction.reply({
    components: [
      panel([textBlock(body), sepBlock(false)]),
      actionRow(linkBtn(`${baseUrl}/dashboard`, "Ouvrir le dashboard", "🌐")),
    ],
    flags: FLAGS_V2,
  });
}
