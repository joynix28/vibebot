import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, errPanel, msgPanel, BLUE, GOLD } from "../../../core/ui.ts";
import { getQueue } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("lyrics")
  .setDescription("Affiche les paroles d'un morceau (si disponibles).")
  .addStringOption((o) =>
    o
      .setName("morceau")
      .setDescription("« Artiste - Titre ». Par défaut : le morceau en cours.")
      .setMaxLength(200)
  );

interface LyricsResponse {
  lyrics?: string;
  error?: string;
}

async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as LyricsResponse;
    const lyrics = data.lyrics?.trim();
    return lyrics ? lyrics : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  let raw = interaction.options.getString("morceau")?.trim();
  if (!raw) {
    const np = getQueue(guild.id)?.nowPlaying();
    if (!np) {
      await interaction.reply({ components: [errPanel("Rien n'est en cours de lecture. Précise un morceau : `/lyrics morceau:Artiste - Titre`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    raw = np.song.title;
  }

  await interaction.deferReply({ flags: FLAGS_V2 });

  const dash = raw.indexOf(" - ");
  const artist = dash > 0 ? raw.slice(0, dash).trim() : "";
  const title = dash > 0 ? raw.slice(dash + 3).trim() : raw;

  let lyrics: string | null = null;
  if (artist && title) lyrics = await fetchLyrics(artist, title);

  if (!lyrics) {
    await interaction.editReply({
      components: [
        msgPanel(
          `## 📝 Paroles\n**${raw.slice(0, 120)}**\n\n_Paroles non disponibles pour ce morceau._\nAstuce : précise « Artiste - Titre » pour améliorer la recherche.`,
          GOLD
        ),
      ],
      flags: FLAGS_V2,
    });
    return;
  }

  const shown = lyrics.length > 3500 ? `${lyrics.slice(0, 3500)}\n\n_… (tronqué)_` : lyrics;
  await interaction.editReply({
    components: [msgPanel(`## 📝 Paroles — **${raw.slice(0, 120)}**\n\n${shown}`, BLUE)],
    flags: FLAGS_V2,
  });
}
