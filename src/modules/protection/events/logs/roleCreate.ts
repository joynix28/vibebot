import { AuditLogEvent, Events } from "discord.js";
import type { Role } from "discord.js";
import {
  buildRoleCreateEmbed,
  enqueueLogEmbed,
  findAuditEntry,
} from "../../func/logger.ts";

export const name = Events.GuildRoleCreate;

export async function execute(role: Role): Promise<void> {
  if (!role.guild) return;

  // Ignore les actions du bot lui-même.
  const entry = await findAuditEntry(role.guild, AuditLogEvent.RoleCreate, role.id);
  if (entry?.executor && role.client.user && entry.executor.id === role.client.user.id) return;

  enqueueLogEmbed(role.guild, "server", buildRoleCreateEmbed(role));
}
