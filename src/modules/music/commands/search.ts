import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  FLAGS_V2,
  errPanel,
  msgPanel,
  BLUE,
} from "../../../core/ui.ts";
import type { MessageActionRowComponentBuilder } from "discord.js";
import { ensureQueue, searchTracks, formatDuration } from "../func/player.ts";
import type { Song } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Recherche un morceau et choisis parmi les 5 meilleurs résultats.")
  .addStringOption((o) =>
    o.setName("requete").setDescription("Titre à rechercher.").setRequired(true).setMaxLength(200)
  );

interface PendingSearch {
  songs: Song[];
  userId: string;
  expires: number;
}

const pending = new Map<string, PendingSearch>();

function newToken(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}, 60_000).unref?.();

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("requete", true);
  await interaction.deferReply({ flags: FLAGS_V2 });

  const results = await searchTracks(query, interaction.user.id);
  if (results.length === 0) {
    await interaction.editReply({ components: [errPanel("❌ Aucun résultat pour cette recherche.")], flags: FLAGS_V2 });
    return;
  }

  const token = newToken();
  pending.set(token, { songs: results, userId: interaction.user.id, expires: Date.now() + 120_000 });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`search:pick:${token}`)
    .setPlaceholder("Choisis un morceau…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      results.map((s, i) => ({
        label: s.title.slice(0, 100),
        description: `Durée : ${formatDuration(s.duration)}`.slice(0, 100),
        value: String(i),
        emoji: ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i] ?? "🎵",
      }))
    );

  const lines = results
    .map((s, i) => `${["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"][i]} **[${s.title}](${s.url})** \`[${formatDuration(s.duration)}]\``)
    .join("\n");

  await interaction.editReply({
    components: [
      msgPanel(`🔎 **Résultats pour :** *${query.slice(0, 100)}*\n\n${lines}`, BLUE),
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu),
    ],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const menu = interaction as StringSelectMenuInteraction;
  const token = menu.customId.split(":")[2];
  const entry = token ? pending.get(token) : undefined;
  if (!token || !entry) {
    await menu.reply({ components: [errPanel("Cette recherche a expiré. Relance `/search`.")], flags: FLAGS_V2 });
    return;
  }
  const idx = Number(menu.values[0] ?? "");
  const song = Number.isFinite(idx) ? entry.songs[idx] : undefined;
  if (!song) {
    await menu.reply({ components: [errPanel("Choix invalide.")], flags: FLAGS_V2 });
    return;
  }
  pending.delete(token);

  await menu.deferUpdate();
  const joined = await ensureQueue(menu);
  if ("error" in joined) {
    await menu.followUp({ components: [errPanel(joined.error)], flags: FLAGS_V2 });
    return;
  }
  const wasIdle = !joined.queue.nowPlaying();
  await joined.queue.addSongs([song]);
  await menu.editReply({
    components: [
      msgPanel(
        wasIdle
          ? `▶️ **Lecture en cours**\n**[${song.title}](${song.url})** \`[${formatDuration(song.duration)}]\``
          : `🎵 **Ajouté à la file**\n**[${song.title}](${song.url})** \`[${formatDuration(song.duration)}]\``,
        BLUE
      ),
    ],
    flags: FLAGS_V2,
  });
}
