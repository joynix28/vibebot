import { Events } from "discord.js";
import type { Role } from "discord.js";
import { onRoleUpdate } from "./changeTrack.ts";

export const name = Events.GuildRoleUpdate;

export async function execute(oldR: Role, newR: Role): Promise<void> {
  await onRoleUpdate(oldR, newR);
}
