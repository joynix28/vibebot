import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { BLUE, FLAGS_V2, panel, textBlock } from "../func/ui.ts";
import { topXp } from "../func/db.ts";
import { levelFromXp } from "../func/xp.ts";

export const data = new SlashCommandBuilder()
  .setName("level-top")
  .setDescription("Affiche le classement des 10 membres les plus actifs (XP).");

const MEDALS = ["🥇", "🥈", "🥉"];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement sur un serveur.", ephemeral: true });
    return;
  }
  const rows = topXp(guild.id, 10);
  if (rows.length === 0) {
    await interaction.reply({
      components: [panel([textBlock("# 🏆 Classement XP\n> *Personne n'a encore gagné d'XP sur ce serveur.*")], BLUE)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = rows.map((r, i) => {
    const medal = MEDALS[i] ?? `**#${i + 1}**`;
    return `${medal} <@${r.user_id}> — Niveau \`${levelFromXp(r.xp)}\` (\`${r.xp}\` XP)`;
  });
  await interaction.reply({
    components: [panel([textBlock(`# 🏆 Classement XP\n${lines.join("\n")}`)], BLUE)],
    flags: FLAGS_V2,
  });
}
