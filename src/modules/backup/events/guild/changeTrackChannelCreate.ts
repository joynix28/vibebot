import { Events } from "discord.js";
import type { GuildChannel } from "discord.js";
import { onChannelCreate } from "./changeTrack.ts";

export const name = Events.ChannelCreate;

export async function execute(channel: GuildChannel): Promise<void> {
  await onChannelCreate(channel);
}
