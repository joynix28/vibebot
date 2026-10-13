import { db } from "../../../core/db.ts";

// Persistance du module music : réglages par serveur + playlists.
// Toutes les requêtes sont paramétrées (?), tables préfixées `music_*`.

db.exec(`
  CREATE TABLE IF NOT EXISTS music_settings (
    guild_id TEXT PRIMARY KEY,
    dj_role TEXT,
    text_channel TEXT,
    voice_channel TEXT,
    default_volume INTEGER NOT NULL DEFAULT 80,
    skip_percent INTEGER NOT NULL DEFAULT 50,
    stay_time INTEGER NOT NULL DEFAULT 30
  );
  CREATE TABLE IF NOT EXISTS music_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tracks TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (guild_id, name)
  );
`);

// ---------------------------------------------------------------------------
// Réglages serveur
// ---------------------------------------------------------------------------

export interface MusicSettings {
  guild_id: string;
  dj_role: string | null;
  text_channel: string | null;
  voice_channel: string | null;
  default_volume: number;
  skip_percent: number;
  stay_time: number;
}

const DEFAULT_SETTINGS: Omit<MusicSettings, "guild_id"> = {
  dj_role: null,
  text_channel: null,
  voice_channel: null,
  default_volume: 80,
  skip_percent: 50,
  stay_time: 30,
};

export function getSettings(guildId: string): MusicSettings {
  const row = db.query("SELECT * FROM music_settings WHERE guild_id = ?").get(guildId) as MusicSettings | null;
  return row ?? { guild_id: guildId, ...DEFAULT_SETTINGS };
}

export interface SettingsPatch {
  dj_role?: string | null;
  text_channel?: string | null;
  voice_channel?: string | null;
  default_volume?: number;
  skip_percent?: number;
  stay_time?: number;
}

/** Met à jour les réglages (patch partiel) et retourne la ligne complète. */
export function saveSettings(guildId: string, patch: SettingsPatch): MusicSettings {
  const cur = getSettings(guildId);
  const next: MusicSettings = {
    guild_id: guildId,
    dj_role: patch.dj_role !== undefined ? patch.dj_role : cur.dj_role,
    text_channel: patch.text_channel !== undefined ? patch.text_channel : cur.text_channel,
    voice_channel: patch.voice_channel !== undefined ? patch.voice_channel : cur.voice_channel,
    default_volume:
      patch.default_volume !== undefined ? clampInt(patch.default_volume, 0, 100) : cur.default_volume,
    skip_percent:
      patch.skip_percent !== undefined ? clampInt(patch.skip_percent, 10, 100) : cur.skip_percent,
    stay_time: patch.stay_time !== undefined ? clampInt(patch.stay_time, 0, 600) : cur.stay_time,
  };
  db.run(
    `INSERT INTO music_settings (guild_id, dj_role, text_channel, voice_channel, default_volume, skip_percent, stay_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id) DO UPDATE SET
       dj_role = excluded.dj_role,
       text_channel = excluded.text_channel,
       voice_channel = excluded.voice_channel,
       default_volume = excluded.default_volume,
       skip_percent = excluded.skip_percent,
       stay_time = excluded.stay_time`,
    [next.guild_id, next.dj_role, next.text_channel, next.voice_channel, next.default_volume, next.skip_percent, next.stay_time]
  );
  return next;
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// ---------------------------------------------------------------------------
// Playlists persistantes
// ---------------------------------------------------------------------------

export interface PlaylistTrack {
  title: string;
  url: string;
  duration: number;
}

export interface MusicPlaylist {
  id: number;
  guild_id: string;
  name: string;
  tracks: PlaylistTrack[];
  created_by: string;
  created_at: number;
}

function rowToPlaylist(row: {
  id: number;
  guild_id: string;
  name: string;
  tracks: string;
  created_by: string;
  created_at: number;
}): MusicPlaylist {
  let tracks: PlaylistTrack[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tracks);
    if (Array.isArray(parsed)) {
      tracks = parsed.filter(
        (t): t is PlaylistTrack =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as PlaylistTrack).url === "string" &&
          typeof (t as PlaylistTrack).title === "string"
      );
    }
  } catch {
    tracks = [];
  }
  return { ...row, tracks };
}

const MAX_PLAYLIST_NAME = 50;
const MAX_TRACKS_PER_PLAYLIST = 200;

export function sanitizePlaylistName(name: string): string {
  return name.trim().slice(0, MAX_PLAYLIST_NAME);
}

export function createPlaylist(
  guildId: string,
  name: string,
  tracks: PlaylistTrack[],
  createdBy: string
): MusicPlaylist {
  const clean = sanitizePlaylistName(name);
  if (!clean) throw new Error("Nom de playlist invalide.");
  const limited = tracks.slice(0, MAX_TRACKS_PER_PLAYLIST);
  db.run("INSERT INTO music_playlists (guild_id, name, tracks, created_by, created_at) VALUES (?, ?, ?, ?, ?)", [
    guildId,
    clean,
    JSON.stringify(limited),
    createdBy,
    Date.now(),
  ]);
  const row = db
    .query("SELECT * FROM music_playlists WHERE guild_id = ? AND name = ?")
    .get(guildId, clean) as {
    id: number;
    guild_id: string;
    name: string;
    tracks: string;
    created_by: string;
    created_at: number;
  } | null;
  if (!row) throw new Error("Création de la playlist impossible.");
  return rowToPlaylist(row);
}

export function getPlaylist(guildId: string, name: string): MusicPlaylist | null {
  const row = db
    .query("SELECT * FROM music_playlists WHERE guild_id = ? AND name = ?")
    .get(guildId, sanitizePlaylistName(name)) as {
    id: number;
    guild_id: string;
    name: string;
    tracks: string;
    created_by: string;
    created_at: number;
  } | null;
  return row ? rowToPlaylist(row) : null;
}

export function listPlaylists(guildId: string): MusicPlaylist[] {
  const rows = db
    .query("SELECT * FROM music_playlists WHERE guild_id = ? ORDER BY name ASC")
    .all(guildId) as {
    id: number;
    guild_id: string;
    name: string;
    tracks: string;
    created_by: string;
    created_at: number;
  }[];
  return rows.map(rowToPlaylist);
}

export function deletePlaylist(guildId: string, name: string): boolean {
  const res = db.run("DELETE FROM music_playlists WHERE guild_id = ? AND name = ?", [
    guildId,
    sanitizePlaylistName(name),
  ]);
  return res.changes > 0;
}

export function playlistExists(guildId: string, name: string): boolean {
  const row = db
    .query("SELECT 1 AS ok FROM music_playlists WHERE guild_id = ? AND name = ?")
    .get(guildId, sanitizePlaylistName(name)) as { ok: number } | null;
  return row !== null;
}
