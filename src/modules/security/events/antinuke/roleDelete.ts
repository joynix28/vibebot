import { Events } from "discord.js";
import type { Role } from "discord.js";
import { handleNuke } from "../../func/protection.ts";

export const name = Events.GuildRoleDelete;

export async function execute(role: Role): Promise<void> {
  await handleNuke(role.guild, "role_delete");
}
