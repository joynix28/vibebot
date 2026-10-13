import { Events } from "discord.js";
import type { Client } from "discord.js";
import { startTempbanLoop } from "../func/antiraid/tempbans.ts";
import { hydrateGuildChannelCache } from "../func/antiraid/channelCache.ts";

// Démarrage du module protection : cache salons + boucle des tempbans.

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    try {
      hydrateGuildChannelCache(guild);
    } catch {
      /* ignore */
    }
  }
  startTempbanLoop(client);
}
