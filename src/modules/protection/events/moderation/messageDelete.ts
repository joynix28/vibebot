import { Events } from "discord.js";
import type { Message } from "discord.js";
import { isWhitelisted, saveSnipe } from "../../func/db.ts";
import { FLAGS_V2, msgPanel } from "../../../../core/ui.ts";

// Sauvegarde du dernier message supprimé (snipe) + avertissement ghost-ping
// quand une mention @everyone/@here est supprimée.

export const name = Events.MessageDelete;

export async function execute(message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  // Snipe : mémorise le contenu pour la commande snipe (autre module)
  if (message.content && message.author && !message.author.bot) {
    saveSnipe(
      guild.id,
      message.channelId,
      JSON.stringify({
        content: message.content,
        author: {
          username: message.author.globalName ?? message.author.username,
          avatar: message.author.displayAvatarURL(),
          id: message.author.id,
        },
        date: Date.now(),
      }),
    );
  }

  // Ghost-ping : avertit si une mention everyone/here est supprimée
  const author = message.author;
  if (!author || author.bot) return;
  let mentionedEveryone = false;
  try {
    mentionedEveryone = message.mentions?.everyone ?? false;
  } catch {
    return;
  }
  if (!mentionedEveryone) return;
  if (author.id === guild.client.user?.id || isWhitelisted(guild.id, guild.ownerId, author.id)) return;

  const channel = message.channel;
  if (!("send" in channel)) return;
  await channel
    .send({
      components: [msgPanel(`👻 **${author}** — ghost-ping détecté : une mention @everyone/@here a été supprimée.`)],
      flags: FLAGS_V2,
    })
    .catch(() => null);
}
