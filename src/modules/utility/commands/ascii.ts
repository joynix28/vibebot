import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("ascii")
  .setDescription("Convertit un petit texte en art ASCII.")
  .addStringOption((o) => o.setName("texte").setDescription("10 caractères max (A-Z, 0-9).").setRequired(true).setMaxLength(10));

// Police maison 5x5 (sans dépendance externe).
const FONT: Record<string, string[]> = {
  A: [" ### ", "#   #", "#####", "#   #", "#   #"],
  B: ["#### ", "#   #", "#### ", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  F: ["#####", "#    ", "#### ", "#    ", "#    "],
  G: [" ####", "#    ", "#  ##", "#   #", " ####"],
  H: ["#   #", "#   #", "#####", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["  ###", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "###  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#### ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  S: [" ####", "#    ", " ### ", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
  X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "   # ", "  #  ", " #   ", "#####"],
  "0": [" ### ", "#  ##", "# # #", "##  #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "   # ", "  #  ", "#####"],
  "3": ["#### ", "    #", " ### ", "    #", "#### "],
  "4": ["#   #", "#   #", "#####", "    #", "    #"],
  "5": ["#####", "#    ", "#### ", "    #", "#### "],
  "6": [" ### ", "#    ", "#### ", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   "],
  "8": [" ### ", "#   #", " ### ", "#   #", " ### "],
  "9": [" ### ", "#   #", " ####", "    #", " ### "],
  " ": ["     ", "     ", "     ", "     ", "     "],
  "!": ["  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "   # ", "     ", "  #  "],
  "-": ["     ", "     ", "#####", "     ", "     "],
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const texte = interaction.options.getString("texte", true).toUpperCase();
  if (!/^[A-Z0-9 !?\-]{1,10}$/.test(texte)) {
    await interaction.reply({ components: [errPanel("Caractères autorisés : A-Z, 0-9, espace, ! ? -.")], flags: FLAGS_V2 });
    return;
  }
  const rows: string[] = ["", "", "", "", ""];
  for (const ch of texte) {
    const glyph = FONT[ch] ?? FONT[" "]!;
    for (let r = 0; r < 5; r++) rows[r] += glyph[r] + " ";
  }
  const art = rows.map((r) => r.replace(/ +$/, "")).join("\n");
  await interaction.reply({ components: [panel([textBlock(`\`\`\`\n${art}\n\`\`\``)])], flags: FLAGS_V2 });
}
