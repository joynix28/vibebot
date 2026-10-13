import { Events } from "discord.js";
import type { Role } from "discord.js";
import { onRoleDelete } from "./changeTrack.ts";

export const name = Events.GuildRoleDelete;

export async function execute(role: Role): Promise<void> {
  await onRoleDelete(role);
}
