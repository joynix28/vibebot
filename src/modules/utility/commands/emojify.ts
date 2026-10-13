import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("emojify")
  .setDescription("Transforme un texte en emojis.")
  .addStringOption((o) => o.setName("texte").setDescription("Le texte à convertir.").setRequired(true).setMaxLength(200));

const CHIFFRES: Record<string, string> = {
  "0": "0️⃣", "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣",
  "5": "5️⃣", "6": "6️⃣", "7": "7️⃣", "8": "8️⃣", "9": "9️⃣",
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const texte = interaction.options.getString("texte", true);
  let out = "";
  for (const ch of texte.toLowerCase()) {
    if (ch >= "a" && ch <= "z") out += `:regional_indicator_${ch}: `;
    else if (CHIFFRES[ch]) out += `${CHIFFRES[ch]} `;
    else if (ch === " ") out += "  ";
    else if (ch === "!") out += "❗ ";
    else if (ch === "?") out += "❓ ";
    else out += `${ch} `;
  }
  out = out.trim();
  if (out.length === 0 || out.length > 1900) {
    await interaction.reply({ components: [errPanel("Texte invalide ou trop long après conversion.")], flags: FLAGS_V2 });
    return;
  }
  await interaction.reply({ components: [panel([textBlock(out)])], flags: FLAGS_V2 });
}
