import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("choisir")
  .setDescription("Choisit une option au hasard parmi celles proposées.")
  .addStringOption((o) =>
    o.setName("options").setDescription("Options séparées par des virgules : pizza, sushi, tacos").setRequired(true).setMaxLength(500)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raw = interaction.options.getString("options", true);
  const choix = raw
    .split(/[,|\n]/)
    .map((s) => s.trim().slice(0, 100))
    .filter((s) => s.length > 0)
    .slice(0, 20);
  if (choix.length < 2) {
    await interaction.reply({ components: [errPanel("Propose au moins 2 options séparées par des virgules.")], flags: FLAGS_V2 });
    return;
  }
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0) % choix.length;
  await interaction.reply({
    components: [okPanel(`🎲 Parmi **${choix.length}** options, je choisis…\n\n## ${choix[n]}`)],
    flags: FLAGS_V2,
  });
}
