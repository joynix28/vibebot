import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("move")
  .setDescription("Déplace un morceau dans la file d'attente (DJ uniquement).")
  .addIntegerOption((o) =>
    o.setName("de").setDescription("Position actuelle du morceau (voir /queue).").setRequired(true).setMinValue(1)
  )
  .addIntegerOption((o) =>
    o.setName("vers").setDescription("Nouvelle position souhaitée.").setRequired(true).setMinValue(1)
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
  const from = interaction.options.getInteger("de", true);
  const to = interaction.options.getInteger("vers", true);
  if (!queue.move(from, to)) {
    await interaction.reply({
      components: [errPanel(`Positions invalides. La file contient ${queue.upcoming.length} morceau(x) en attente.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({ components: [okPanel(`↕️ Morceau déplacé de la position ${from} vers la position ${to}.`)], flags: FLAGS_V2 });
}
