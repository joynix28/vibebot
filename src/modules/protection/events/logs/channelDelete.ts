import { AuditLogEvent, Events } from "discord.js";
import type { NonThreadGuildBasedChannel } from "discord.js";
import {
  buildChannelDeleteEmbed,
  enqueueLogEmbed,
  findAuditEntry,
} from "../../func/logger.ts";

export const name = Events.ChannelDelete;

export async function execute(channel: NonThreadGuildBasedChannel): Promise<void> {
  if (!channel.guild) return;

  // Ignore les actions du bot lui-même.
  const entry = await findAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
  if (entry?.executor && channel.client.user && entry.executor.id === channel.client.user.id) return;

  enqueueLogEmbed(
    channel.guild,
    "server",
    buildChannelDeleteEmbed({ id: channel.id, name: channel.name })
  );
}
