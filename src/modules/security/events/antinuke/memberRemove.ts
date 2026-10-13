import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { handleNuke, isAutoPunished } from "../../func/protection.ts";

export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember): Promise<void> {
  if (isAutoPunished(member.guild.id, member.id)) return;
  await handleNuke(member.guild, "kick");
}
