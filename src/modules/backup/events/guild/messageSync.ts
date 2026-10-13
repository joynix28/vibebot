import { Events } from "discord.js";
import type { Message } from "discord.js";
import { syAll } from "../../func/db.ts";

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) return;

  const syncs = syAll().filter((s) => s.type === "messages");
  for (const s of syncs) {
    const [src, dst] = s.target.split(":");
    if (!src || !dst) continue;

    const inSrc = message.channelId === src;
    const inDst = message.channelId === dst;
    if (!inSrc && !inDst) continue;

    const shouldCopy = inSrc
      ? s.direction === "to" || s.direction === "both"
      : s.direction === "from" || s.direction === "both";
    if (!shouldCopy) continue;

    const targetId = inSrc ? dst : src;
    const target = message.guild.channels.cache.get(targetId);
    if (!target || !target.isTextBased()) continue;

    const content = message.content || "\u200b";
    await (target as any).send(content).catch(() => {});
  }
}
