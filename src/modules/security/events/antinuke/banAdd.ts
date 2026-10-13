import { Events } from "discord.js";
import type { GuildBan } from "discord.js";
import { handleNuke, isAutoPunished } from "../../func/protection.ts";

export const name = Events.GuildBanAdd;

export async function execute(ban: GuildBan): Promise<void> {
  if (isAutoPunished(ban.guild.id, ban.user.id)) return;
  await handleNuke(ban.guild, "ban");
}
