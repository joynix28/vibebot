import { Events } from "discord.js";
import type { NonThreadGuildBasedChannel } from "discord.js";
import { handleNuke } from "../../func/protection.ts";

export const name = Events.ChannelCreate;

export async function execute(channel: NonThreadGuildBasedChannel): Promise<void> {
  await handleNuke(channel.guild, "channel_create");
}
