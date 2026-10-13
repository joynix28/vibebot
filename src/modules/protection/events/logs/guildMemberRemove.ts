import { Events } from "discord.js";
import type { GuildMember, PartialGuildMember } from "discord.js";
import { sendMemberLeaveLog } from "../../func/logger.ts";

export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember | PartialGuildMember): Promise<void> {
  // sendMemberLeaveLog ignore les bots et enfile l'embed dans la catégorie "members".
  sendMemberLeaveLog(member.guild, member);
}
