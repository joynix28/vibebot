import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { refreshServerStats } from "../func/serverstats.ts";

// Actualisation des compteurs serverstats à l'arrivée d'un membre.

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  try {
    await refreshServerStats(member.guild);
  } catch {
    /* noop */
  }
}
