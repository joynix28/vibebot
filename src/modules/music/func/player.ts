import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  type VoiceConnection,
  type AudioPlayer,
  type AudioResource,
} from "@discordjs/voice";
import { PermissionFlagsBits } from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  VoiceBasedChannel,
} from "discord.js";
import play from "play-dl";

/** Personne ayant demandé le morceau. */
export interface TrackRequester {
  id: string;
  tag: string;
}

/** Un morceau de la file d'attente. */
export interface Track {
  title: string;
  url: string;
  durationSec: number;
  thumbnail?: string;
  requestedBy: TrackRequester;
}

export type LoopMode = "off" | "track" | "queue";

interface GuildPlayer {
  queue: Track[];
  index: number;
  loop: LoopMode;
  volume: number;
  paused: boolean;
  connection: VoiceConnection | null;
  audioPlayer: AudioPlayer;
  current: Track | null;
  resource: AudioResource | null;
}

const players = new Map<string, GuildPlayer>();

export const MUSIC_ACCENT = 0x9b59b6;
/** Délai max pour établir la connexion vocale (utile si l'UDP est bloqué). */
const VOICE_READY_TIMEOUT = 15_000;

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** État public d'un lecteur (pour les hubs), ou null si inexistant. */
export interface PlayerState {
  queue: Track[];
  index: number;
  loop: LoopMode;
  volume: number;
  paused: boolean;
  current: Track | null;
  connected: boolean;
}

export function getPlayer(guildId: string): GuildPlayer {
  const existing = players.get(guildId);
  if (existing) return existing;
  const audioPlayer = createAudioPlayer();
  const gp: GuildPlayer = {
    queue: [],
    index: 0,
    loop: "off",
    volume: 50,
    paused: false,
    connection: null,
    audioPlayer,
    current: null,
    resource: null,
  };
  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    void onIdle(guildId).catch((e) => console.error("[music] idle:", e));
  });
  audioPlayer.on("error", (e) => {
    console.error("[music] player error:", (e as Error).message);
    void onIdle(guildId).catch((err) => console.error("[music] idle:", err));
  });
  players.set(guildId, gp);
  return gp;
}

export function getState(guildId: string): PlayerState | null {
  const gp = players.get(guildId);
  if (!gp) return null;
  return {
    queue: [...gp.queue],
    index: gp.index,
    loop: gp.loop,
    volume: gp.volume,
    paused: gp.paused,
    current: gp.current,
    connected: gp.connection !== null,
  };
}

/** Joue le morceau à `startIndex`, en sautant ceux dont le stream échoue. */
async function playAt(gp: GuildPlayer, guildId: string, startIndex: number): Promise<void> {
  let i = startIndex;
  while (i < gp.queue.length) {
    const track = gp.queue[i];
    if (!track) {
      i++;
      continue;
    }
    gp.index = i;
    gp.current = track;
    gp.paused = false;
    try {
      const s = await play.stream(track.url);
      const resource = createAudioResource(s.stream, { inputType: s.type, inlineVolume: true });
      resource.volume?.setVolume(gp.volume / 100);
      gp.resource = resource;
      gp.audioPlayer.play(resource);
      return;
    } catch (e) {
      console.error("[music] stream failed, skipping:", track.url, (e as Error).message);
      gp.queue.splice(i, 1);
    }
  }
  stopPlayback(guildId);
}

/** Appelé quand le lecteur devient inactif (fin de morceau ou erreur). */
async function onIdle(guildId: string): Promise<void> {
  const gp = players.get(guildId);
  if (!gp) return;
  const conn = gp.connection;
  if (!conn || conn.state.status === VoiceConnectionStatus.Destroyed) {
    stopPlayback(guildId);
    return;
  }
  if (gp.loop === "track" && gp.current) {
    await playAt(gp, guildId, gp.index);
    return;
  }
  let nextIndex = gp.index + 1;
  if (nextIndex >= gp.queue.length) {
    if (gp.loop === "queue" && gp.queue.length > 0) {
      nextIndex = 0;
    } else {
      stopPlayback(guildId);
      return;
    }
  }
  await playAt(gp, guildId, nextIndex);
}

/**
 * Rejoint un salon vocal. Lève une Error avec un message clair si la
 * connexion vocale échoue (ex : UDP bloqué, salon inaccessible).
 */
export async function joinVoice(guild: Guild, channel: VoiceBasedChannel): Promise<void> {
  const gp = getPlayer(guild.id);
  const conn = gp.connection;
  const usable =
    conn &&
    conn.joinConfig.channelId === channel.id &&
    conn.state.status !== VoiceConnectionStatus.Destroyed &&
    conn.state.status !== VoiceConnectionStatus.Disconnected;
  if (usable) return;
  if (conn) {
    try {
      conn.destroy();
    } catch {
      /* noop */
    }
    gp.connection = null;
  }
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  gp.connection = connection;
  connection.subscribe(gp.audioPlayer);
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, VOICE_READY_TIMEOUT);
  } catch {
    try {
      connection.destroy();
    } catch {
      /* noop */
    }
    gp.connection = null;
    throw new Error(
      "Impossible de rejoindre le salon vocal : la connexion audio a échoué " +
        "(réseau UDP bloqué ou salon inaccessible). Vérifie que le bot a les permissions " +
        "« Se connecter » et « Parler », puis réessaie."
    );
  }
}

/** Ajoute un morceau à la file ; démarre la lecture si rien ne joue. */
export async function addTrack(
  guildId: string,
  track: Track
): Promise<{ position: number; playing: boolean }> {
  const gp = getPlayer(guildId);
  gp.queue.push(track);
  const position = gp.queue.length;
  if (!gp.current && gp.audioPlayer.state.status === AudioPlayerStatus.Idle) {
    await playAt(gp, guildId, gp.queue.length - 1);
    return { position, playing: true };
  }
  return { position, playing: false };
}

/** Passe au morceau suivant (ignore la boucle "morceau"). */
export async function skip(guildId: string): Promise<boolean> {
  const gp = players.get(guildId);
  if (!gp || !gp.current) return false;
  let ni = gp.index + 1;
  if (ni >= gp.queue.length) {
    if (gp.loop === "queue" && gp.queue.length > 0) {
      ni = 0;
    } else {
      stopPlayback(guildId);
      return true;
    }
  }
  await playAt(gp, guildId, ni);
  return true;
}

/** Revient au morceau précédent. */
export async function previous(guildId: string): Promise<boolean> {
  const gp = players.get(guildId);
  if (!gp || !gp.current || gp.index <= 0) return false;
  await playAt(gp, guildId, gp.index - 1);
  return true;
}

/** Saute directement au morceau d'index donné. */
export async function goto(guildId: string, index: number): Promise<boolean> {
  const gp = players.get(guildId);
  if (!gp || index < 0 || index >= gp.queue.length) return false;
  await playAt(gp, guildId, index);
  return true;
}

/** Met en pause / reprend la lecture. */
export function setPaused(guildId: string, paused: boolean): boolean {
  const gp = players.get(guildId);
  if (!gp || !gp.current) return false;
  if (paused) gp.audioPlayer.pause();
  else gp.audioPlayer.unpause();
  gp.paused = paused;
  return true;
}

export function setLoop(guildId: string, mode: LoopMode): boolean {
  const gp = players.get(guildId);
  if (!gp) return false;
  gp.loop = mode;
  return true;
}

export function setVolume(guildId: string, volume: number): boolean {
  const gp = players.get(guildId);
  if (!gp) return false;
  gp.volume = Math.max(0, Math.min(100, Math.round(volume)));
  gp.resource?.volume?.setVolume(gp.volume / 100);
  return true;
}

/** Mélange la file en gardant le morceau en cours en premier. */
export function shuffle(guildId: string): boolean {
  const gp = players.get(guildId);
  if (!gp || gp.queue.length < 2) return false;
  const current = gp.current;
  const rest = gp.queue.filter((t) => t !== current);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = rest[i];
    const b = rest[j];
    if (a !== undefined && b !== undefined) {
      rest[i] = b;
      rest[j] = a;
    }
  }
  gp.queue = current ? [current, ...rest] : rest;
  gp.index = 0;
  return true;
}

/** Vide la file à venir (le morceau en cours continue). */
export function clearQueue(guildId: string): boolean {
  const gp = players.get(guildId);
  if (!gp || gp.queue.length === 0) return false;
  if (gp.current) {
    gp.queue = [gp.current];
    gp.index = 0;
  } else {
    gp.queue = [];
    gp.index = 0;
  }
  return true;
}

/** Arrête tout : lecture, file, connexion vocale. */
export function stopPlayback(guildId: string): void {
  const gp = players.get(guildId);
  players.delete(guildId);
  if (!gp) return;
  try {
    gp.audioPlayer.stop(true);
  } catch {
    /* noop */
  }
  if (gp.connection) {
    try {
      gp.connection.destroy();
    } catch {
      /* noop */
    }
  }
}

/** Quitte le salon vocal et nettoie le lecteur. */
export function leave(guildId: string): void {
  stopPlayback(guildId);
}

/** Salon vocal du membre, ou null s'il n'est dans aucun salon. */
export function resolveVoiceChannel(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction
): VoiceBasedChannel | null {
  const member = interaction.member as GuildMember | null;
  const channel = member?.voice.channel;
  if (!channel || !channel.isVoiceBased()) return null;
  return channel;
}

/** Vérifie que le bot peut se connecter et parler ; retourne la permission manquante ou null. */
export function botVoicePerms(channel: VoiceBasedChannel): "connect" | "speak" | null {
  const me = channel.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.Connect)) return "connect";
  if (!perms?.has(PermissionFlagsBits.Speak)) return "speak";
  return null;
}
