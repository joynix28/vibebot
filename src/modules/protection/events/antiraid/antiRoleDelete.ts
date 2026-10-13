import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

function bits(v: unknown): bigint {
  try {
    return BigInt((v as string | number | bigint | undefined) ?? 0);
  } catch {
    return 0n;
  }
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.RoleDelete, {
    actionKey: "supprimé un rôle",
    preCheck: (e) => Boolean(e.changes),
    revert: async (e, g) => {
      const getOld = (key: string): unknown => e.changes?.find((k) => k.key === key)?.old;
      try {
        await g.roles
          .create({
            name: (getOld("name") as string | undefined) ?? "Rôle restauré",
            colors: { primaryColor: (getOld("color") as number | undefined) ?? 0 },
            hoist: (getOld("hoist") as boolean | undefined) ?? false,
            mentionable: (getOld("mentionable") as boolean | undefined) ?? false,
            permissions: bits(getOld("permissions")),
            reason: "[ANTI-RAID]",
          })
          .catch(() => null);
      } catch {
        /* ignore */
      }
    },
  });
}
