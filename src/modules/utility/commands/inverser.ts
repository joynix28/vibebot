import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("inverser")
  .setDescription("Inverse l'ordre des caractères d'un texte.")
  .addStringOption((o) => o.setName("texte").setDescription("Le texte à inverser.").setRequired(true).setMaxLength(500));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const texte = interaction.options.getString("texte", true);
  const inverse = [...texte].reverse().join("");
  if (inverse.length === 0) {
    await interaction.reply({ components: [errPanel("Texte vide.")], flags: FLAGS_V2 });
    return;
  }
  await interaction.reply({ components: [panel([textBlock(`🔄 \`${texte}\`\n\n## ${inverse}`)])], flags: FLAGS_V2 });
}
