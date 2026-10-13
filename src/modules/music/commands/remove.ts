import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("remove")
  .setDescription("Retire un morceau de la file d'attente (DJ uniquement).")
  .addIntegerOption((o) =>
    o.setName("position").setDescription("Numéro du morceau dans la file (voir /queue).").setRequired(true).setMinValue(1)
  );

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
  const pos = interaction.options.getInteger("position", true);
  const removed = queue.removeAt(pos);
  if (!removed) {
    await interaction.reply({
      components: [errPanel(`Position invalide. La file contient ${queue.upcoming.length} morceau(x) en attente.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({ components: [okPanel(`🗑️ **${removed.title}** retiré de la file.`)], flags: FLAGS_V2 });
}
