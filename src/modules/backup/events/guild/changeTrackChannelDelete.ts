import { Events } from "discord.js";
import type { GuildChannel } from "discord.js";
import { onChannelDelete } from "./changeTrack.ts";

export const name = Events.ChannelDelete;

export async function execute(channel: GuildChannel): Promise<void> {
  await onChannelDelete(channel);
}
