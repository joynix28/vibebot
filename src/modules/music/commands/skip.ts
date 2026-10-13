import type { HubInteraction } from "./_hub.ts";
import { asQueueInteraction } from "./_hub.ts";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { getQueue, canControl, listenerCount, votesNeeded, formatDuration } from "../func/player.ts";
import { getSettings } from "../func/db.ts";

export async function runSkip(interaction: HubInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  const np = queue?.nowPlaying();
  if (!queue || !np) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (canControl(asQueueInteraction(interaction))) {
    queue.skip();
    await interaction.reply({ components: [okPanel(`⏭️ Morceau passé.` )], flags: FLAGS_V2 });
    return;
  }

  if (queue.hasVoted(interaction.user.id)) {
    await interaction.reply({ components: [errPanel("Tu as déjà voté pour passer ce morceau.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const votes = queue.addVote(interaction.user.id);
  const needed = votesNeeded(listenerCount(guild, queue.voiceChannelId), getSettings(guild.id).skip_percent);
  if (votes >= needed) {
    const title = np.song.title;
    queue.skip();
    const next = queue.nowPlaying();
    await interaction.reply({
      components: [
        msgPanel(
          `⏭️ **Morceau passé par vote** (${votes}/${needed})\n` +
            (next
              ? `▶️ **En cours :** [${next.song.title}](${next.song.url}) \`[${formatDuration(next.song.duration)}]\``
              : `_« ${title} » était le dernier morceau._`),
          BLUE
        ),
      ],
      flags: FLAGS_V2,
    });
  } else {
    await interaction.reply({
      components: [msgPanel(`🗳️ Vote enregistré pour passer le morceau : **${votes}/${needed}** votes.`, BLUE)],
      flags: FLAGS_V2,
    });
  }
}
