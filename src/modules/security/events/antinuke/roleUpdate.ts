import { Events } from "discord.js";
import type { Role } from "discord.js";
import { handleNuke, DANGEROUS_PERMS } from "../../func/protection.ts";

export const name = Events.GuildRoleUpdate;

export async function execute(oldRole: Role, newRole: Role): Promise<void> {
  const hadDanger = DANGEROUS_PERMS.some((p) => oldRole.permissions.has(p));
  const hasDanger = DANGEROUS_PERMS.some((p) => newRole.permissions.has(p));
  if (hadDanger || !hasDanger) return;

  await handleNuke(newRole.guild, "role_update");
}
