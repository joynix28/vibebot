import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.MemberKick, {
    actionKey: "expulsé trop de membres",
    // Filet : le kick d'un bot n'est jamais sanctionné
    preCheck: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return false;
      const user =
        g.client.users.cache.get(targetId) ?? (await g.client.users.fetch(targetId).catch(() => null));
      return !user?.bot;
    },
  });
}
