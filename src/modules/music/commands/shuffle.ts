import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("shuffle")
  .setDescription("Mélange l'ordre de la file d'attente (DJ uniquement).");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser cette commande.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (queue.upcoming.length < 2) {
    await interaction.reply({ components: [errPanel("Il faut au moins 2 morceaux en attente pour mélanger.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  queue.shuffle();
  await interaction.reply({ components: [okPanel("🔀 File d'attente mélangée.")], flags: FLAGS_V2 });
}
