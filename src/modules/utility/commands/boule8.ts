import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("boule8")
  .setDescription("Pose une question à la boule magique.")
  .addStringOption((o) => o.setName("question").setDescription("Ta question (oui / non).").setRequired(true).setMaxLength(200));

const REPONSES = [
  "C'est certain. 🔮",
  "Sans aucun doute. ✅",
  "Oui, définitivement. 👍",
  "Tu peux compter dessus. 💪",
  "Très probablement. 😌",
  "Oui. ✨",
  "Les signes disent oui. 🌟",
  "C'est flou, réessaie. 🌫️",
  "Demande à nouveau plus tard. ⏳",
  "Mieux vaut ne pas te le dire maintenant. 🤫",
  "Impossible à prédire pour l'instant. 🎲",
  "Concentre-toi et redemande. 🧘",
  "N'y compte pas. 🚫",
  "Ma réponse est non. ❌",
  "Mes sources disent non. 📉",
  "Les perspectives ne sont pas bonnes. 🌧️",
  "Très douteux. 🤨",
  "Non, définitivement pas. 🙅",
  "Peut-être… qui sait ? 🤷",
  "Absolument pas, oublie ça. 💀",
];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true).trim();
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const reponse = REPONSES[new DataView(bytes.buffer).getUint32(0) % REPONSES.length]!;

  await interaction.reply({
    components: [panel([textBlock(`🎱 **${interaction.user} demande :**\n> *${question}*\n\n## ${reponse}`)], 0x9b59b6)],
    flags: FLAGS_V2,
  });
}
