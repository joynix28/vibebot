import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { handleNuke, handleRaid } from "../../func/protection.ts";

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  if (member.user.bot) {
    await handleNuke(member.guild, "bot");
  } else {
    await handleRaid(member.guild, member);
  }
}
