import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { syAll } from "../../func/db.ts";

export const name = Events.GuildMemberUpdate;

export async function execute(oldM: GuildMember, newM: GuildMember): Promise<void> {
  if (oldM.roles.cache.has(newM.id)) return;
  if (oldM.roles.cache.equals(newM.roles.cache)) return;

  const added = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id));
  const removed = oldM.roles.cache.filter((r) => !newM.roles.cache.has(r.id));
  if (added.size === 0 && removed.size === 0) return;

  const syncs = syAll().filter((s) => s.type === "roles");
  for (const s of syncs) {
    const [roleA, serverB, roleB] = s.target.split(":");
    if (!roleA || !serverB || !roleB) continue;

    for (const r of added.values()) {
      if (r.id === roleA && (s.direction === "to" || s.direction === "both")) {
        const gb = newM.client.guilds.cache.get(serverB);
        const mb = await gb?.members.fetch(newM.id).catch(() => null);
        await mb?.roles.add(roleB).catch(() => {});
      }
      if (r.id === roleB && (s.direction === "from" || s.direction === "both")) {
        await newM.roles.add(roleA).catch(() => {});
      }
    }

    for (const r of removed.values()) {
      if (r.id === roleA && (s.direction === "to" || s.direction === "both")) {
        const gb = newM.client.guilds.cache.get(serverB);
        const mb = await gb?.members.fetch(newM.id).catch(() => null);
        await mb?.roles.remove(roleB).catch(() => {});
      }
      if (r.id === roleB && (s.direction === "from" || s.direction === "both")) {
        await newM.roles.remove(roleA).catch(() => {});
      }
    }
  }
}
