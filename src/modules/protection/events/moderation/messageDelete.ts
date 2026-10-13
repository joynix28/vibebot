import { Events } from "discord.js";
import type { Message } from "discord.js";
import { isWhitelisted, saveSnipe, getProtectConfig } from "../../func/db.ts";
import { FLAGS_V2, msgPanel } from "../../../../core/ui.ts";

// Sauvegarde du dernier message supprimé (snipe) + avertissement ghost-ping
// quand une mention (@everyone/@here ou utilisateur) est supprimée.
// Activable/désactivable via /protect-config > Bienvenue > Ghost ping.

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

  // Ghost-ping : avertit si une mention est supprimée (everyone/here ou
  // mention d'un utilisateur). Respecte le toggle et les salons configurés
  // dans /protect-config (Bienvenue > Ghost ping).
  const author = message.author;
  if (!author || author.bot) return;
  let cfg: ReturnType<typeof getProtectConfig>;
  try {
    cfg = getProtectConfig(guild.id);
  } catch {
    return;
  }
  if (!cfg.welcome.ghostping.enabled) return;
  const watched = cfg.welcome.ghostping.channels;
  if (watched.length > 0 && !watched.includes(message.channelId)) return;

  let mentionedEveryone = false;
  let mentionedUsers: string[] = [];
  try {
    mentionedEveryone = message.mentions?.everyone ?? false;
    mentionedUsers = [...(message.mentions?.users?.values() ?? [])]
      .filter((u) => !u.bot && u.id !== author.id)
      .map((u) => u.id);
  } catch {
    return;
  }
  if (!mentionedEveryone && mentionedUsers.length === 0) return;
  if (author.id === guild.client.user?.id || isWhitelisted(guild.id, guild.ownerId, author.id)) return;

  const cible = mentionedEveryone
    ? "une mention @everyone/@here"
    : mentionedUsers.map((id) => `<@${id}>`).join(" ");
  const channel = message.channel;
  if (!("send" in channel)) return;
  await channel
    .send({
      components: [msgPanel(`👻 **${author}** — ghost-ping détecté : ${cible} a été mentionné${mentionedEveryone ? "e" : ""} puis le message a été supprimé.`)],
      flags: FLAGS_V2,
    })
    .catch(() => null);
}
