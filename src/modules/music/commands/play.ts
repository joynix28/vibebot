import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { ensureQueue, resolveQuery, formatDuration, MAX_QUERY_LENGTH } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue un morceau YouTube / SoundCloud ou l'ajoute à la file d'attente.")
  .addStringOption((o) =>
    o
      .setName("requete")
      .setDescription("Titre à rechercher, ou lien YouTube / SoundCloud.")
      .setRequired(true)
      .setMaxLength(MAX_QUERY_LENGTH)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("requete", true);
  await interaction.deferReply({ flags: FLAGS_V2 });

  const joined = await ensureQueue(interaction);
  if ("error" in joined) {
    await interaction.editReply({ components: [errPanel(joined.error)], flags: FLAGS_V2 });
    return;
  }

  const song = await resolveQuery(query, interaction.user.id);
  if (!song) {
    await interaction.editReply({
      components: [
        errPanel(
          "❌ Aucun résultat. Vérifie ta recherche.\nSeuls les liens **YouTube** et **SoundCloud** sont acceptés."
        ),
      ],
      flags: FLAGS_V2,
    });
    return;
  }

  const wasIdle = !joined.queue.nowPlaying();
  await joined.queue.addSongs([song]);

  if (wasIdle) {
    await interaction.editReply({
      components: [
        okPanel(
          `▶️ **Lecture en cours**\n**[${song.title}](${song.url})** \`[${formatDuration(song.duration)}]\`\nDemandé par <@${song.requestedBy}>`
        ),
      ],
      flags: FLAGS_V2,
    });
  } else {
    const pos = joined.queue.upcoming.length;
    await interaction.editReply({
      components: [
        msgPanel(
          `🎵 **Ajouté à la file** (position ${pos})\n**[${song.title}](${song.url})** \`[${formatDuration(song.duration)}]\`\nDemandé par <@${song.requestedBy}>`,
          BLUE
        ),
      ],
      flags: FLAGS_V2,
    });
  }
}
