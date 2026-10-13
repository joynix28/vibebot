import { Events } from "discord.js";
import type { Message } from "discord.js";
import { getPubChannel, recordPubPost } from "../func/db-plus.ts";

// Comptabilise les pubs (messages contenant un lien d'invitation Discord)
// postées dans le salon configuré via /pub config.

const INVITE_RE = /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-z0-9-]+/i;

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const channelId = getPubChannel(message.guild.id);
  if (!channelId || message.channelId !== channelId) return;
  if (!INVITE_RE.test(message.content)) return;
  recordPubPost(message.guild.id, message.author.id);
}
