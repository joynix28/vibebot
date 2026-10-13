import { Events } from "discord.js";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { refreshServerStats } from "../func/serverstats.ts";

// Actualisation des compteurs serverstats au départ d'un membre.

export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember | PartialGuildMember): Promise<void> {
  try {
    await refreshServerStats(member.guild);
  } catch {
    /* noop */
  }
}
