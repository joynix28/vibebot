import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("motdepasse")
  .setDescription("Génère un mot de passe aléatoire et sûr (réponse privée).")
  .addIntegerOption((o) =>
    o.setName("longueur").setDescription("Longueur du mot de passe (8 à 64).").setMinValue(8).setMaxValue(64)
  )
  .addBooleanOption((o) => o.setName("majuscules").setDescription("Inclure A-Z (oui par défaut)."))
  .addBooleanOption((o) => o.setName("chiffres").setDescription("Inclure 0-9 (oui par défaut)."))
  .addBooleanOption((o) => o.setName("symboles").setDescription("Inclure !@#$… (non par défaut)."));

const MIN = "abcdefghijklmnopqrstuvwxyz";
const MAJ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHI = "0123456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.<>?/";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const longueur = interaction.options.getInteger("longueur") ?? 16;
  const maj = interaction.options.getBoolean("majuscules") ?? true;
  const chi = interaction.options.getBoolean("chiffres") ?? true;
  const sym = interaction.options.getBoolean("symboles") ?? false;

  let pool = MIN;
  if (maj) pool += MAJ;
  if (chi) pool += CHI;
  if (sym) pool += SYM;
  if (pool.length === 0) {
    await interaction.reply({ components: [errPanel("Choisis au moins un type de caractères.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const bytes = new Uint8Array(longueur);
  crypto.getRandomValues(bytes);
  let pwd = "";
  for (let i = 0; i < longueur; i++) pwd += pool[bytes[i]! % pool.length]!;

  await interaction.reply({
    components: [okPanel(`🔑 **Mot de passe généré** (\`${longueur}\` caractères) :\n\`\`\`\n${pwd}\n\`\`\`\n*Visible uniquement par toi — ne le partage jamais.*`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
