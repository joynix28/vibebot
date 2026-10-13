import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { BLUE, FLAGS_V2, panel, textBlock } from "../func/ui.ts";
import { getXp, rankOf } from "../func/db.ts";
import { progressBar, progressFromXp } from "../func/xp.ts";

// Carte de niveau en panneau Components V2 (pas de canvas sous Bun :
// la carte image du legacy est dégradée en panneau texte avec barre de progression).

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("Affiche la carte de niveau d'un membre.")
  .addUserOption((o) =>
    o.setName("membre").setDescription("Le membre à afficher (défaut : toi).")
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement sur un serveur.", ephemeral: true });
    return;
  }
  const target = interaction.options.getUser("membre") ?? interaction.user;
  const row = getXp(guild.id, target.id);
  const prog = progressFromXp(row.xp);
  const rank = rankOf(guild.id, target.id);
  const member = await guild.members.fetch(target.id).catch(() => null);
  const name = member?.displayName ?? target.username;

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `# 🏅 ${name}\n` +
              `> **Niveau :** \`${prog.level}\` • **Rang :** \`#${rank}\`\n` +
              `> **XP :** \`${prog.inLevel}\` / \`${prog.span}\` (total \`${prog.totalXp}\` XP)\n\n` +
              `${progressBar(prog.percent)}`
          ),
        ],
        BLUE
      ),
    ],
    flags: FLAGS_V2,
  });
}
