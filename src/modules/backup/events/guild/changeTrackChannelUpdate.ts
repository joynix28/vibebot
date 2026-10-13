import { Events } from "discord.js";
import type { GuildChannel } from "discord.js";
import { onChannelUpdate } from "./changeTrack.ts";

export const name = Events.ChannelUpdate;

export async function execute(oldC: GuildChannel, newC: GuildChannel): Promise<void> {
  await onChannelUpdate(oldC, newC);
}
