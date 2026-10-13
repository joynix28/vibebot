import { Events } from "discord.js";
import type { Role } from "discord.js";
import { onRoleCreate } from "./changeTrack.ts";

export const name = Events.GuildRoleCreate;

export async function execute(role: Role): Promise<void> {
  await onRoleCreate(role);
}
