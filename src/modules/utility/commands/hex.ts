import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, mediaBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("hex")
  .setDescription("Affiche un aperçu d'une couleur hexadécimale.")
  .addStringOption((o) =>
    o.setName("couleur").setDescription("Code hex, ex. : ff0000 ou #ff0000").setRequired(true).setMaxLength(7)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const raw = interaction.options.getString("couleur", true).trim().replace(/^#/, "");
  const hex = /^[0-9a-fA-F]{3}$/.test(raw)
    ? raw.split("").map((c) => c + c).join("")
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    await interaction.reply({ components: [errPanel("Code couleur invalide. Utilise 3 ou 6 caractères hexadécimaux, ex. : `ff0000`.")], flags: FLAGS_V2 });
    return;
  }
  const h = hex.toLowerCase();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`## 🎨 \`#${h}\`\n> **RGB :** \`${r}, ${g}, ${b}\`\n> **Discord :** \`0x${h}\``),
          mediaBlock([{ url: `https://dummyimage.com/200x200/${h}/${h}.png`, description: `Aperçu de la couleur #${h}` }]),
        ],
        parseInt(h, 16)
      ),
    ],
    flags: FLAGS_V2,
  });
}
