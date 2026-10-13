import { Events } from "discord.js";
import type { Message } from "discord.js";
import { ensureGuild, parseNukeActions } from "../../func/db.ts";

export const name = Events.MessageCreate;

const INVITE_RE = /(discord\.(gg|com\/invite|app\/invite)\/\S+)/i;

export async function execute(message: Message): Promise<void> {
  if (!message.guild || message.author.bot || !message.content) return;
  if (!INVITE_RE.test(message.content)) return;

  const cfg = ensureGuild(message.guild.id);
  const invite = parseNukeActions(cfg).invite;
  if (!invite?.enabled) return;

  await message.delete().catch(() => {});
}
