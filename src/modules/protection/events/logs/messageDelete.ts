import { Events } from "discord.js";
import type { Message, PartialMessage } from "discord.js";
import {
  buildMessageDeleteEmbed,
  enqueueLogEmbed,
  isLogChannel,
} from "../../func/logger.ts";
import { saveSnipe } from "../../func/db.ts";

export const name = Events.MessageDelete;

export async function execute(message: Message | PartialMessage): Promise<void> {
  // Récupère le message complet si possible ; sinon on ne peut rien exploiter.
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (!full) return;

  const { author, guild, channel } = full;
  if (!author || !guild) return;

  // Ignore les bots, les actions du bot lui-même et les salons de logs (anti-boucle).
  const isSelf = full.client.user !== null && author.id === full.client.user.id;
  if (!author.bot && !isSelf && !isLogChannel(guild.id, channel.id)) {
    enqueueLogEmbed(guild, "messages", buildMessageDeleteEmbed(full));
  }

  // Sauvegarde du snipe.
  if (full.content) {
    const attachments = [...full.attachments.values()].map((a) => a.url);
    saveSnipe(
      guild.id,
      channel.id,
      JSON.stringify({
        author: {
          username: author.globalName ?? author.username,
          avatar: author.displayAvatarURL(),
          id: author.id,
        },
        content: full.content,
        attachments,
      })
    );
  }
}
