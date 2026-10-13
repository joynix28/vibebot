import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("de")
  .setDescription("Lance un ou plusieurs dés.")
  .addIntegerOption((o) =>
    o.setName("faces").setDescription("Nombre de faces par dé (2 à 100).").setMinValue(2).setMaxValue(100)
  )
  .addIntegerOption((o) =>
    o.setName("nombre").setDescription("Nombre de dés à lancer (1 à 20).").setMinValue(1).setMaxValue(20)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const faces = interaction.options.getInteger("faces") ?? 6;
  const nombre = interaction.options.getInteger("nombre") ?? 1;

  const bytes = new Uint8Array(nombre * 4);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  const jets: number[] = [];
  for (let i = 0; i < nombre; i++) jets.push((view.getUint32(i * 4) % faces) + 1);
  const total = jets.reduce((a, b) => a + b, 0);

  const detail = nombre > 1 ? `\n> Détail : ${jets.map((j) => `\`${j}\``).join(" + ")}` : "";
  await interaction.reply({
    components: [okPanel(`🎲 **${interaction.user}** lance ${nombre} dé${nombre > 1 ? "s" : ""} à ${faces} faces…\n\n## 🎯 ${total}${detail}`)],
    flags: FLAGS_V2,
  });
}
