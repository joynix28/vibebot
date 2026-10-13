import { db } from "../../../core/db.ts";
import type { Guild } from "discord.js";

// Compteurs de statistiques du serveur (salons vocaux verrouillés affichant
// les chiffres). Un seul jeu de compteurs par serveur.

db.exec(`
  CREATE TABLE IF NOT EXISTS legacy_serverstats (
    guild_id TEXT PRIMARY KEY,
    members_channel_id TEXT,
    online_channel_id TEXT,
    boosts_channel_id TEXT
  );
`);

export interface ServerStats {
  guild_id: string;
  members_channel_id: string | null;
  online_channel_id: string | null;
  boosts_channel_id: string | null;
}

export function getServerStats(guildId: string): ServerStats | null {
  const row = db
    .query("SELECT * FROM legacy_serverstats WHERE guild_id = ?")
    .get(guildId) as ServerStats | null;
  return row ?? null;
}

export function setServerStats(guildId: string, channels: { members?: string; online?: string; boosts?: string }): void {
  db.query(
    `INSERT INTO legacy_serverstats (guild_id, members_channel_id, online_channel_id, boosts_channel_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (guild_id) DO UPDATE SET
       members_channel_id = excluded.members_channel_id,
       online_channel_id = excluded.online_channel_id,
       boosts_channel_id = excluded.boosts_channel_id`
  ).run(guildId, channels.members ?? null, channels.online ?? null, channels.boosts ?? null);
}

export function clearServerStats(guildId: string): void {
  db.query("DELETE FROM legacy_serverstats WHERE guild_id = ?").run(guildId);
}

/** Nombres affichés par les compteurs. */
export function computeStats(guild: Guild): { members: number; online: number; boosts: number } {
  const members = guild.memberCount;
  const online = guild.members.cache.filter(
    (m) => !m.user.bot && m.presence && m.presence.status !== "offline"
  ).size;
  const boosts = guild.premiumSubscriptionCount ?? 0;
  return { members, online, boosts };
}

/** Renomme les salons compteurs avec les chiffres actuels. */
export async function refreshServerStats(guild: Guild): Promise<boolean> {
  const cfg = getServerStats(guild.id);
  if (!cfg) return false;
  const stats = computeStats(guild);
  const updates: [string | null, string][] = [
    [cfg.members_channel_id, `👥 Membres : ${stats.members}`],
    [cfg.online_channel_id, `🟢 En ligne : ${stats.online}`],
    [cfg.boosts_channel_id, `🚀 Boosts : ${stats.boosts}`],
  ];
  let ok = false;
  for (const [channelId, name] of updates) {
    if (!channelId) continue;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isVoiceBased()) continue;
    if (channel.name !== name) {
      await channel.setName(name).catch(() => null);
    }
    ok = true;
  }
  return ok;
}
