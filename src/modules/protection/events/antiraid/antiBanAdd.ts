import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.MemberBanAdd, {
    actionKey: "banni trop de membres",
    revert: async (e, g) => {
      if (e.targetId) await g.bans.remove(e.targetId, "[ANTI-RAID]").catch(() => null);
    },
  });
}
