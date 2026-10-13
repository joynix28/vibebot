import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { onGuildUpdate } from "./changeTrack.ts";

export const name = Events.GuildUpdate;

export async function execute(oldG: Guild, newG: Guild): Promise<void> {
  await onGuildUpdate(oldG, newG);
}
