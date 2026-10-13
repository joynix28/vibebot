import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { refreshInviteCache } from "../func/inviteCache.ts";

// Initialise le cache des invitations quand le bot rejoint un nouveau serveur
// (le cache initial est construit au ClientReady par events/scheduler.ts).

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  await refreshInviteCache(guild).catch(() => {});
}
