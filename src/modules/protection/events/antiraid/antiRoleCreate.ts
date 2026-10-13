import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.RoleCreate, {
    actionKey: "crée un rôle",
    revert: async (e, g) => {
      if (!e.targetId) return;
      await g.roles.cache.get(e.targetId)?.delete("[ANTI-RAID]").catch(() => null);
    },
  });
}
