import { AuditLogEvent, ChannelType, Events } from "discord.js";
import type { NonThreadGuildBasedChannel } from "discord.js";
import {
  buildChannelCreateEmbed,
  enqueueLogEmbed,
  findAuditEntry,
} from "../../func/logger.ts";

export const name = Events.ChannelCreate;

const SKIP_LOG_CHANNEL_TYPES = new Set([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

export async function execute(channel: NonThreadGuildBasedChannel): Promise<void> {
  if (!channel.guild) return;
  if (SKIP_LOG_CHANNEL_TYPES.has(channel.type)) return;

  // Ignore les actions du bot lui-même.
  const entry = await findAuditEntry(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
  if (entry?.executor && channel.client.user && entry.executor.id === channel.client.user.id) return;

  enqueueLogEmbed(channel.guild, "server", buildChannelCreateEmbed(channel));
}
