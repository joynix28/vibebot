import { Events } from "discord.js";
import type { Message, PartialMessage } from "discord.js";
import {
  buildMessageUpdateEmbed,
  enqueueLogEmbed,
  isLogChannel,
} from "../../func/logger.ts";

export const name = Events.MessageUpdate;

export async function execute(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): Promise<void> {
  const old = oldMessage.partial ? await oldMessage.fetch().catch(() => null) : oldMessage;
  const full = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (!old || !full) return;

  const { author, guild } = full;
  if (!guild || !author) return;

  // Ignore les bots et les actions du bot lui-même.
  if (author.bot) return;
  if (full.client.user && author.id === full.client.user.id) return;

  if (old.content === full.content) return;

  // Anti-boucle : ne pas logger les modifications dans les salons de logs.
  if (isLogChannel(guild.id, full.channel.id)) return;

  enqueueLogEmbed(guild, "messages", buildMessageUpdateEmbed(old.content, full));
}
