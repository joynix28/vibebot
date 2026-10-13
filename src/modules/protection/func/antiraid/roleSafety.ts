import type { Guild, GuildAuditLogsEntry, Role } from "discord.js";
import { listDangerousPermissionNames } from "./dangerousPermissions.ts";

/** Rôles dangereux ajoutés à un membre selon l'entrée d'audit log (changement "$add"). */
export async function getDangerousAddedRoles(guild: Guild, entry: GuildAuditLogsEntry): Promise<Role[]> {
  const change = entry.changes?.find((c) => c.key === "$add");
  const added = Array.isArray(change?.new) ? (change.new as Array<{ id?: unknown }>) : [];
  const roles: Role[] = [];
  for (const item of added) {
    const id = typeof item?.id === "string" ? item.id : null;
    if (!id) continue;
    const role = guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null));
    if (role && listDangerousPermissionNames(role.permissions.bitfield).length > 0) roles.push(role);
  }
  return roles;
}
