import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

function bits(v: unknown, fallback: bigint): bigint {
  if (v === undefined) return fallback;
  try {
    return BigInt(v as string | number | bigint);
  } catch {
    return fallback;
  }
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.RoleUpdate, {
    actionKey: "modifié un rôle",
    preCheck: (e) => Boolean(e.target && e.changes),
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const target = g.roles.cache.get(targetId);
      if (!target) return;
      const getOld = (key: string): unknown => e.changes?.find((k) => k.key === key)?.old;
      try {
        await target
          .edit({
            name: (getOld("name") as string | undefined) ?? target.name,
            colors: { primaryColor: (getOld("color") as number | undefined) ?? target.color },
            hoist: (getOld("hoist") as boolean | undefined) ?? target.hoist,
            mentionable: (getOld("mentionable") as boolean | undefined) ?? target.mentionable,
            permissions: bits(getOld("permissions"), target.permissions.bitfield),
            reason: "[ANTI-RAID]",
          })
          .catch(() => null);
      } catch {
        /* ignore */
      }
    },
  });
}
