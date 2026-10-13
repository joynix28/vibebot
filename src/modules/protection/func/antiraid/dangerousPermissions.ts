import { PermissionsBitField } from "discord.js";

const DANGEROUS_PERMISSIONS = [
  "Administrator",
  "ManageGuild",
  "ManageChannels",
  "ManageRoles",
  "ManageWebhooks",
  "BanMembers",
  "KickMembers",
  "MentionEveryone",
  "ModerateMembers",
  "ManageEvents",
  "ManageThreads",
  "ManageMessages",
  "ViewAuditLog",
] as const;

/** Noms des permissions dangereuses présentes dans un bitfield. */
export function listDangerousPermissionNames(bitfield: bigint): string[] {
  const perms = new PermissionsBitField(bitfield);
  return DANGEROUS_PERMISSIONS.filter((name) => perms.has(PermissionsBitField.Flags[name]));
}
