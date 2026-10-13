import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
  type VoiceConnection,
  type AudioResource,
} from "@discordjs/voice";
import { PermissionFlagsBits } from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  Guild,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import playdl from "play-dl";
import { getSettings } from "./db.ts";
import { panel, textBlock, msgPanel, BLUE, FLAGS_V2 } from "../../../core/ui.ts";

// Gestionnaire de file musicale par serveur (inspiré d'evobot / JMusicBot).

export interface Song {
  title: string;
  url: string;
  /** Durée en secondes (0 = inconnue / direct). */
  duration: number;
  /** ID de l'utilisateur ayant demandé le morceau. */
  requestedBy: string;
  thumbnail?: string;
}

export type LoopMode = "off" | "track" | "queue";

export const LOOP_LABELS: Record<LoopMode, string> = {
  off: "désactivée",
  track: "morceau",
  queue: "file",
};

// ---------------------------------------------------------------------------
// Validation des entrées (sécurité)
// ---------------------------------------------------------------------------

const MUSIC_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "www.music.youtube.com",
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);

export const MAX_QUERY_LENGTH = 500;

/** N'accepte que les URLs YouTube / SoundCloud en http(s). */
export function isAllowedMusicUrl(input: string): boolean {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  return MUSIC_HOSTS.has(u.hostname.toLowerCase());
}

export function sanitizeQuery(query: string): string | null {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  return q.length > 0 ? q : null;
}

// ---------------------------------------------------------------------------
// Résolution play-dl
// ---------------------------------------------------------------------------

function toSong(title: string | undefined, url: string, duration: number | undefined, requestedBy: string, thumbnail?: string): Song {
  return {
    title: title?.trim() || "Titre inconnu",
    url,
    duration: Math.max(0, Math.floor(duration ?? 0)),
    requestedBy,
    thumbnail,
  };
}

/** Résout une requête : URL YouTube/SoundCloud directe, sinon 1er résultat de recherche. */
export async function resolveQuery(query: string, requestedBy: string): Promise<Song | null> {
  const q = sanitizeQuery(query);
  if (!q) return null;
  try {
    if (isAllowedMusicUrl(q)) {
      const info = await playdl.video_basic_info(q);
      const v = info.video_details;
      return toSong(v.title, v.url, v.durationInSec, requestedBy, v.thumbnails?.[0]?.url);
    }
    const results = await playdl.search(q, { limit: 1 });
    const v = results[0];
    if (!v) return null;
    return toSong(v.title, v.url, v.durationInSec, requestedBy, v.thumbnails?.[0]?.url);
  } catch (err) {
    console.error("[music] resolveQuery impossible", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Recherche les 5 meilleurs résultats (pour /search). */
export async function searchTracks(query: string, requestedBy: string): Promise<Song[]> {
  const q = sanitizeQuery(query);
  if (!q) return [];
  try {
    const results = await playdl.search(q, { limit: 5 });
    return results.map((v) => toSong(v.title, v.url, v.durationInSec, requestedBy, v.thumbnails?.[0]?.url));
  } catch (err) {
    console.error("[music] search impossible", err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// File musicale
// ---------------------------------------------------------------------------

const queues = new Map<string, MusicQueue>();

export class MusicQueue {
  readonly guildId: string;
  textChannelId: string;
  readonly voiceChannelId: string;
  readonly connection: VoiceConnection;
  private readonly player = createAudioPlayer();
  private songs: Song[] = [];
  private current: Song | null = null;
  private currentResource: AudioResource | null = null;
  private forceAdvance = false;
  private stayTimeout: ReturnType<typeof setTimeout> | null = null;
  private announceFn: ((text: string) => Promise<void>) | null = null;
  destroyed = false;
  loop: LoopMode = "off";
  volume: number;
  private skipVotes = new Set<string>();

  constructor(guildId: string, textChannelId: string, voiceChannelId: string, connection: VoiceConnection, volume: number) {
    this.guildId = guildId;
    this.textChannelId = textChannelId;
    this.voiceChannelId = voiceChannelId;
    this.connection = connection;
    this.volume = Math.min(100, Math.max(0, Math.round(volume)));
    connection.subscribe(this.player);

    this.player.on(AudioPlayerStatus.Idle, () => {
      void this.playNext();
    });
    this.player.on("error", (err) => {
      console.error("[music] erreur lecteur", err.message);
      void this.playNext();
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void (async () => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          this.destroy("déconnexion vocale");
        }
      })();
    });
  }

  /** Prochains morceaux (sans le morceau en cours). */
  get upcoming(): Song[] {
    return [...this.songs];
  }

  get currentSong(): Song | null {
    return this.current;
  }

  get size(): number {
    return this.songs.length + (this.current ? 1 : 0);
  }

  get paused(): boolean {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  get playing(): boolean {
    return this.player.state.status === AudioPlayerStatus.Playing;
  }

  async addSongs(songs: Song[]): Promise<void> {
    if (this.destroyed || songs.length === 0) return;
    this.songs.push(...songs);
    this.clearStayTimeout();
    if (this.player.state.status === AudioPlayerStatus.Idle && !this.current) {
      await this.playNext();
    }
  }

  private async makeResource(song: Song): Promise<AudioResource | null> {
    try {
      const s = await playdl.stream(song.url);
      const resource = createAudioResource(s.stream, {
        inputType: s.type as unknown as StreamType,
        inlineVolume: true,
      });
      resource.volume?.setVolume(this.volume / 100);
      return resource;
    } catch (err) {
      console.error("[music] stream impossible", err instanceof Error ? err.message : err);
      return null;
    }
  }

  private async playNext(): Promise<void> {
    if (this.destroyed) return;
    this.clearStayTimeout();
    const adv = this.forceAdvance;
    this.forceAdvance = false;

    if (this.current && this.loop === "track" && !adv) {
      // Rejoue le même morceau.
    } else {
      if (this.current && this.loop === "queue") this.songs.push(this.current);
      this.current = this.songs.shift() ?? null;
    }
    this.skipVotes.clear();

    if (!this.current) {
      this.onQueueEnd();
      return;
    }
    const resource = await this.makeResource(this.current);
    if (this.destroyed) return;
    if (!resource) {
      this.current = null;
      await this.playNext();
      return;
    }
    this.currentResource = resource;
    this.player.play(resource);
  }

  private onQueueEnd(): void {
    this.currentResource = null;
    const staySec = Math.max(0, getSettings(this.guildId).stay_time);
    void this.announce("🎵 **File d'attente terminée.**");
    if (staySec > 0) {
      this.stayTimeout = setTimeout(() => this.destroy("file terminée"), staySec * 1000);
    } else {
      this.destroy("file terminée");
    }
  }

  private clearStayTimeout(): void {
    if (this.stayTimeout) {
      clearTimeout(this.stayTimeout);
      this.stayTimeout = null;
    }
  }

  private async announce(text: string): Promise<void> {
    if (!this.announceFn) return;
    try {
      await this.announceFn(text);
    } catch {
      /* annonce best effort */
    }
  }

  setAnnounceFn(fn: (text: string) => Promise<void>): void {
    this.announceFn = fn;
  }

  /** Passe au morceau suivant (ignore la boucle "morceau"). */
  skip(): boolean {
    if (!this.current && this.songs.length === 0) return false;
    this.forceAdvance = true;
    this.player.stop(true);
    return true;
  }

  /** Saute directement au morceau n° `index` (1-based, dans les morceaux à venir). */
  skipto(index: number): boolean {
    if (index < 1 || index > this.songs.length) return false;
    this.songs.splice(0, index - 1);
    return this.skip();
  }

  pause(): boolean {
    return this.player.pause(true);
  }

  resume(): boolean {
    return this.player.unpause();
  }

  shuffle(): void {
    for (let i = this.songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = this.songs[i];
      const b = this.songs[j];
      if (a !== undefined && b !== undefined) {
        this.songs[i] = b;
        this.songs[j] = a;
      }
    }
  }

  /** Déplace le morceau n° `from` (1-based) à la position `to` (1-based). */
  move(from: number, to: number): boolean {
    if (from < 1 || from > this.songs.length || to < 1 || to > this.songs.length) return false;
    const [song] = this.songs.splice(from - 1, 1);
    if (!song) return false;
    this.songs.splice(to - 1, 0, song);
    return true;
  }

  /** Retire le morceau n° `index` (1-based) de la file. */
  removeAt(index: number): Song | null {
    if (index < 1 || index > this.songs.length) return null;
    const [song] = this.songs.splice(index - 1, 1);
    return song ?? null;
  }

  setVolume(v: number): number {
    this.volume = Math.min(100, Math.max(0, Math.round(v)));
    this.currentResource?.volume?.setVolume(this.volume / 100);
    return this.volume;
  }

  setLoop(mode: LoopMode): void {
    this.loop = mode;
  }

  addVote(userId: string): number {
    this.skipVotes.add(userId);
    return this.skipVotes.size;
  }

  voteCount(): number {
    return this.skipVotes.size;
  }

  hasVoted(userId: string): boolean {
    return this.skipVotes.has(userId);
  }

  nowPlaying(): { song: Song; elapsedMs: number } | null {
    if (!this.current) return null;
    return { song: this.current, elapsedMs: this.currentResource?.playbackDuration ?? 0 };
  }

  destroy(_reason: string): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearStayTimeout();
    try {
      this.player.stop(true);
    } catch {
      /* noop */
    }
    try {
      this.connection.destroy();
    } catch {
      /* noop */
    }
    queues.delete(this.guildId);
  }
}

// ---------------------------------------------------------------------------
// Accès manager
// ---------------------------------------------------------------------------

export function getQueue(guildId: string): MusicQueue | undefined {
  const q = queues.get(guildId);
  if (q?.destroyed) {
    queues.delete(guildId);
    return undefined;
  }
  return q;
}

/** Rejoint le salon vocal de l'utilisateur (ou récupère la file existante). */
export async function ensureQueue(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction
): Promise<{ queue: MusicQueue; voiceChannel: VoiceBasedChannel } | { error: string }> {
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) return { error: "Cette commande doit être utilisée sur un serveur." };
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) return { error: "Tu dois d'abord rejoindre un salon vocal." };

  const me = guild.members.me;
  const perms = me ? voiceChannel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.Connect)) return { error: "Je ne peux pas me connecter à ton salon vocal." };
  if (!perms?.has(PermissionFlagsBits.Speak)) return { error: "Je ne peux pas parler dans ton salon vocal." };

  let queue = getQueue(guild.id);
  if (queue) {
    if (queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
      queue.destroy("reconnexion");
      queue = undefined;
    } else if (queue.voiceChannelId !== voiceChannel.id) {
      return { error: "Tu dois être dans le même salon vocal que moi." };
    } else {
      queue.textChannelId = interaction.channelId;
      wireAnnounce(interaction, queue);
      return { queue, voiceChannel };
    }
  }

  const settings = getSettings(guild.id);
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch {
    connection.destroy();
    return { error: "Connexion au salon vocal impossible. Réessaie." };
  }
  const fresh = new MusicQueue(guild.id, interaction.channelId, voiceChannel.id, connection, settings.default_volume);
  queues.set(guild.id, fresh);
  wireAnnounce(interaction, fresh);
  return { queue: fresh, voiceChannel };
}

/** Branche l'annonce "file terminée" sur le salon texte courant. */
function wireAnnounce(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  queue: MusicQueue
): void {
  queue.setAnnounceFn(async (text: string) => {
    const ch = await interaction.client.channels.fetch(queue.textChannelId).catch(() => null);
    if (ch && ch.isSendable()) {
      await ch.send({ components: [msgPanel(text, BLUE)], flags: FLAGS_V2 }).catch(() => {});
    }
  });
}

/** Quitte le vocal et supprime la file. */
export function leave(guildId: string): boolean {
  const q = getQueue(guildId);
  if (!q) return false;
  q.destroy("arrêt demandé");
  return true;
}

/** Nettoie la file si le bot est seul (ou déconnecté) dans son salon. */
export function cleanupIfAlone(guild: Guild): void {
  const queue = getQueue(guild.id);
  if (!queue) return;
  const channel = guild.channels.cache.get(queue.voiceChannelId);
  if (!channel?.isVoiceBased()) {
    queue.destroy("salon vocal introuvable");
    return;
  }
  const me = guild.members.me;
  if (!me?.voice.channel || me.voice.channel.id !== queue.voiceChannelId) {
    queue.destroy("déconnecté du vocal");
    return;
  }
  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans === 0) queue.destroy("seul dans le salon vocal");
}

// ---------------------------------------------------------------------------
// Permissions DJ
// ---------------------------------------------------------------------------

/** Vrai si le membre est DJ (rôle DJ configuré) ou peut gérer les messages. */
export function canControl(interaction: ChatInputCommandInteraction | MessageComponentInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId;
  if (!member || !guildId) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const djRole = getSettings(guildId).dj_role;
  if (djRole && member.roles.cache.has(djRole)) return true;
  return false;
}

/** Nombre de votes nécessaires pour passer un morceau. */
export function votesNeeded(listenerCount: number, skipPercent: number): number {
  return Math.max(1, Math.ceil((Math.max(1, listenerCount) * skipPercent) / 100));
}

/** Nombre d'auditeurs humains dans le salon vocal du bot. */
export function listenerCount(guild: Guild, voiceChannelId: string): number {
  const channel = guild.channels.cache.get(voiceChannelId);
  if (!channel?.isVoiceBased()) return 1;
  return Math.max(1, channel.members.filter((m) => !m.user.bot).size);
}

// ---------------------------------------------------------------------------
// Formatage
// ---------------------------------------------------------------------------

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function progressBar(elapsedMs: number, totalMs: number, width = 18): string {
  if (!totalMs || totalMs <= 0) return "🔴 EN DIRECT";
  const ratio = Math.min(1, Math.max(0, elapsedMs / totalMs));
  const pos = Math.round(ratio * width);
  return `${"▬".repeat(pos)}🔘${"▬".repeat(Math.max(0, width - pos))}`;
}

/** Panneau "en cours de lecture" réutilisable (Components V2). */
export function nowPlayingPanel(queue: MusicQueue): ReturnType<typeof panel> {
  const np = queue.nowPlaying();
  if (!np) return panel([textBlock("⏹️ Rien n'est en cours de lecture.")], BLUE);
  const totalMs = np.song.duration * 1000;
  const bar = progressBar(np.elapsedMs, totalMs);
  const pos = `${formatDuration(np.elapsedMs / 1000)} / ${np.song.duration > 0 ? formatDuration(np.song.duration) : "∞"}`;
  const loopTxt = queue.loop === "off" ? "" : ` • 🔁 ${LOOP_LABELS[queue.loop]}`;
  return panel(
    [
      textBlock(
        `## 🎵 En cours de lecture\n**[${np.song.title}](${np.song.url})**\n${bar}\n\`${pos}\` • 🔊 ${queue.volume}%${loopTxt}\nDemandé par <@${np.song.requestedBy}>${queue.paused ? "\n⏸️ *En pause* " : ""}`
      ),
    ],
    BLUE
  );
}
