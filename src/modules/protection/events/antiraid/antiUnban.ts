import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.MemberBanRemove, {
    actionKey: "débanni un membre",
    preCheck: (e) => Boolean(e.targetId ?? (e.target as { id?: string } | null)?.id),
    revert: async (e, g) => {
      const userId = e.targetId ?? (e.target as { id?: string } | null)?.id;
      if (!userId) return;
      await g.bans.create(userId, { reason: "[ANTI-RAID]" }).catch(() => null);
    },
  });
}
