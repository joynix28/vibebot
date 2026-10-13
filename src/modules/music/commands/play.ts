import { SlashCommandBuilder, StringSelectMenuBuilder } from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  sepBlock,
  rowBlock,
  option,
} from "../../tempvoice/func/ui.ts";
import { errPanel } from "../../../core/ui.ts";
import { searchYouTube } from "../func/search.ts";
import {
  MUSIC_ACCENT,
  addTrack,
  joinVoice,
  resolveVoiceChannel,
  botVoicePerms,
  fmtDuration,
  type Track,
} from "../func/player.ts";
import { addedPanel } from "../func/panels.ts";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("🎵 Joue une musique YouTube dans ton salon vocal")
  .addStringOption((o) =>
    o.setName("musique").setDescription("Titre ou lien YouTube").setRequired(true)
  );

interface PendingPick {
  tracks: Track[];
  expires: number;
}

const pending = new Map<string, PendingPick>();
const PICK_TTL = 60_000;

function pendingKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function sweepPending(): void {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (v.expires < now) pending.delete(k);
  }
}

function voiceError(kind: "connect" | "speak"): string {
  return kind === "connect"
    ? "❌ Je n'ai pas la permission **« Se connecter »** dans ton salon vocal."
    : "❌ Je n'ai pas la permission **« Parler »** dans ton salon vocal.";
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      components: [errPanel("Commande utilisable uniquement sur un serveur.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const channel = resolveVoiceChannel(interaction);
  if (!channel) {
    await interaction.reply({
      components: [errPanel("🔇 Rejoins d'abord un salon vocal, puis relance /play.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const missing = botVoicePerms(channel);
  if (missing) {
    await interaction.reply({
      components: [errPanel(voiceError(missing))],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  await interaction.deferReply();
  sweepPending();

  const query = interaction.options.getString("musique", true);
  const requester = { id: interaction.user.id, tag: interaction.user.username };
  let tracks: Track[];
  try {
    tracks = await searchYouTube(query, requester);
  } catch (e) {
    await interaction.editReply({
      components: [errPanel(`❌ ${(e as Error).message}`)],
    });
    return;
  }
  const first = tracks[0];
  if (!first) {
    await interaction.editReply({ components: [errPanel("❌ Aucun résultat trouvé.")] });
    return;
  }
  if (tracks.length === 1) {
    await playOne(interaction, channel, first);
    return;
  }

  // Plusieurs résultats : menu de sélection (60 s).
  const key = pendingKey(guild.id, interaction.user.id);
  pending.set(key, { tracks, expires: Date.now() + PICK_TTL });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`play:select:${interaction.user.id}`)
    .setPlaceholder("Choisis la musique à jouer…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      tracks.map((t, i) =>
        option(t.title.slice(0, 100), t.url, {
          description: `${fmtDuration(t.durationSec)} • résultat ${i + 1}`.slice(0, 100),
          emoji: "🎵",
        })
      )
    );
  const c = panel(
    [
      textBlock(`## 🔎 Résultats pour « ${query.slice(0, 80)} »`),
      textBlock(
        tracks
          .map(
            (t, i) =>
              `**${i + 1}.** [${t.title}](${t.url}) • \`${fmtDuration(t.durationSec)}\``
          )
          .join("\n")
      ),
      sepBlock(),
      rowBlock(menu),
      textBlock("-# ⏳ Ce menu expire dans 60 secondes."),
    ],
    MUSIC_ACCENT
  );
  await interaction.editReply({ components: [c] });
}

/** Rejoint le vocal (si besoin) puis ajoute le morceau. */
async function playOne(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  channel: VoiceBasedChannel,
  track: Track
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  try {
    await joinVoice(guild, channel);
  } catch (e) {
    const c = errPanel(`❌ ${(e as Error).message}`);
    if (interaction.deferred) await interaction.editReply({ components: [c] });
    else await interaction.reply({ components: [c], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const { playing, position } = await addTrack(guild.id, track);
  const c = addedPanel(track, playing, position);
  if (interaction.deferred) await interaction.editReply({ components: [c] });
  else await interaction.reply({ components: [c], flags: FLAGS_V2 });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith("play:select")) return;
  const ownerId = interaction.customId.split(":")[2];
  if (ownerId && interaction.user.id !== ownerId) {
    await interaction.reply({
      components: [errPanel("Ce menu de sélection appartient à quelqu'un d'autre.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const guild = interaction.guild;
  if (!guild) return;
  const key = pendingKey(guild.id, ownerId ?? interaction.user.id);
  const p = pending.get(key);
  if (!p || p.expires < Date.now()) {
    pending.delete(key);
    await interaction.reply({
      components: [errPanel("⏳ Sélection expirée — relance /play.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const track = p.tracks.find((t) => t.url === interaction.values[0]);
  if (!track) {
    await interaction.reply({
      components: [errPanel("Morceau introuvable.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  pending.delete(key);

  const member = interaction.member as GuildMember | null;
  const channel = member?.voice.channel;
  if (!channel || !channel.isVoiceBased()) {
    await interaction.reply({
      components: [errPanel("🔇 Rejoins un salon vocal pour lancer la musique.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const missing = botVoicePerms(channel);
  if (missing) {
    await interaction.reply({
      components: [errPanel(voiceError(missing))],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.deferUpdate();
  await playOne(interaction, channel, track);
}
