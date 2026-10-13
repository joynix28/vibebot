import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { ensureQueue, canControl, getQueue } from "../func/player.ts";
import {
  createPlaylist,
  getPlaylist,
  listPlaylists,
  deletePlaylist,
  playlistExists,
  sanitizePlaylistName,
} from "../func/db.ts";
import type { PlaylistTrack } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("playlist")
  .setDescription("Gère les playlists sauvegardées du serveur.")
  .addSubcommand((s) =>
    s
      .setName("charger")
      .setDescription("Charge une playlist dans la file d'attente.")
      .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist.").setRequired(true).setMaxLength(50))
  )
  .addSubcommand((s) =>
    s
      .setName("sauvegarder")
      .setDescription("Sauvegarde la file d'attente actuelle en playlist.")
      .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist.").setRequired(true).setMaxLength(50))
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Affiche les playlists sauvegardées."))
  .addSubcommand((s) =>
    s
      .setName("supprimer")
      .setDescription("Supprime une playlist sauvegardée.")
      .addStringOption((o) => o.setName("nom").setDescription("Nom de la playlist.").setRequired(true).setMaxLength(50))
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "liste") {
    const lists = listPlaylists(guild.id);
    if (lists.length === 0) {
      await interaction.reply({
        components: [msgPanel("📃 Aucune playlist sauvegardée.\nUtilise `/playlist sauvegarder` pour en créer une.", BLUE)],
        flags: FLAGS_V2,
      });
      return;
    }
    const lines = lists
      .map((p) => `🎵 **${p.name}** — ${p.tracks.length} morceau${p.tracks.length > 1 ? "x" : ""} (par <@${p.created_by}>)`)
      .join("\n");
    await interaction.reply({ components: [msgPanel(`## 📃 Playlists du serveur\n\n${lines}`, BLUE)], flags: FLAGS_V2 });
    return;
  }

  const name = sanitizePlaylistName(interaction.options.getString("nom", true));

  if (sub === "charger") {
    const pl = getPlaylist(guild.id, name);
    if (!pl || pl.tracks.length === 0) {
      await interaction.reply({ components: [errPanel(`Playlist **${name}** introuvable ou vide.`)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferReply({ flags: FLAGS_V2 });
    const joined = await ensureQueue(interaction);
    if ("error" in joined) {
      await interaction.editReply({ components: [errPanel(joined.error)], flags: FLAGS_V2 });
      return;
    }
    const songs = pl.tracks.map((t: PlaylistTrack) => ({
      title: t.title,
      url: t.url,
      duration: t.duration,
      requestedBy: interaction.user.id,
    }));
    await joined.queue.addSongs(songs);
    await interaction.editReply({
      components: [okPanel(`📃 Playlist **${pl.name}** chargée : ${songs.length} morceaux ajoutés à la file.`)],
      flags: FLAGS_V2,
    });
    return;
  }

  if (sub === "sauvegarder") {
    if (!canControl(interaction)) {
      await interaction.reply({ components: [errPanel("Seul un DJ peut sauvegarder une playlist.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const queue = getQueue(guild.id);
    const tracks: PlaylistTrack[] = [];
    const np = queue?.nowPlaying();
    if (np) tracks.push({ title: np.song.title, url: np.song.url, duration: np.song.duration });
    for (const s of queue?.upcoming ?? []) tracks.push({ title: s.title, url: s.url, duration: s.duration });
    if (tracks.length === 0) {
      await interaction.reply({ components: [errPanel("La file d'attente est vide, rien à sauvegarder.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (playlistExists(guild.id, name)) {
      await interaction.reply({
        components: [errPanel(`Une playlist nommée **${name}** existe déjà. Supprime-la d'abord (` + "`/playlist supprimer`" + ").")],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    createPlaylist(guild.id, name, tracks, interaction.user.id);
    await interaction.reply({
      components: [okPanel(`💾 Playlist **${name}** sauvegardée (${tracks.length} morceaux).`)],
      flags: FLAGS_V2,
    });
    return;
  }

  // supprimer
  if (!canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut supprimer une playlist.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const deleted = deletePlaylist(guild.id, name);
  await interaction.reply({
    components: [deleted ? okPanel(`🗑️ Playlist **${name}** supprimée.`) : errPanel(`Playlist **${name}** introuvable.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
