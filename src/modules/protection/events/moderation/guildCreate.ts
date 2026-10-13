import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { addWhitelist, getProtectConfig } from "../../func/db.ts";
import { hydrateGuildChannelCache } from "../../func/antiraid/channelCache.ts";

// Le bot rejoint un serveur : initialise la config par défaut,
// whitelist le bot lui-même + le propriétaire, et construit le cache salons.

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  getProtectConfig(guild.id);

  const botId = guild.client.user?.id;
  if (botId) addWhitelist(guild.id, botId);
  if (guild.ownerId) addWhitelist(guild.id, guild.ownerId);

  try {
    hydrateGuildChannelCache(guild);
  } catch {
    /* ignore */
  }
}
