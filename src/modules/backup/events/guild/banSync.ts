import { Events } from "discord.js";
import type { GuildBan } from "discord.js";
import { syAll } from "../../func/db.ts";

export const name = Events.GuildBanAdd;

export async function execute(ban: GuildBan): Promise<void> {
  const guild = ban.guild;
  if (!guild) return;

  const syncs = syAll().filter((s) => s.type === "bans");
  for (const s of syncs) {
    const [src, dst] = s.target.split(":");
    if (!src || !dst) continue;

    const inSrc = guild.id === src;
    const inDst = guild.id === dst;
    if (!inSrc && !inDst) continue;

    const shouldCopy = inSrc
      ? s.direction === "to" || s.direction === "both"
      : s.direction === "from" || s.direction === "both";
    if (!shouldCopy) continue;

    const targetId = inSrc ? dst : src;
    const target = guild.client.guilds.cache.get(targetId);
    if (!target) continue;

    await target.bans.create(ban.user.id, { reason: "ban sync" }).catch(() => {});
  }
}
