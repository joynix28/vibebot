import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { handleNuke, DANGEROUS_PERMS } from "../../func/protection.ts";

export const name = Events.GuildMemberUpdate;

export async function execute(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
  const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  for (const role of added.values()) {
    if (DANGEROUS_PERMS.some((p) => role.permissions.has(p))) {
      await handleNuke(newMember.guild, "role_add", newMember.id);
      break;
    }
  }
}
