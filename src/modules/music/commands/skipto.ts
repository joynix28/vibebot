import type { HubInteraction } from "./_hub.ts";
import { asQueueInteraction } from "./_hub.ts";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";

export async function runSkipTo(interaction: HubInteraction, pos: number): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canControl(asQueueInteraction(interaction))) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser cette commande.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
    if (!queue.skipto(pos)) {
    await interaction.reply({
      components: [errPanel(`Position invalide. La file contient ${queue.upcoming.length} morceau(x) en attente.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const np = queue.nowPlaying();
  await interaction.reply({
    components: [okPanel(`⏭️ Saut à la position ${pos}.\n▶️ **En cours :** ${np ? `**${np.song.title}**` : "_"}`)],
    flags: FLAGS_V2,
  });
}
