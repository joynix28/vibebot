import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.ChannelOverwriteCreate, {
    actionKey: "ajouté une permission sur un salon",
    revert: async (e, g) => {
      const targetId = e.targetId;
      const extra = e.extra as unknown as string | undefined;
      if (!targetId || !extra) return;
      const channel = g.channels.cache.get(targetId);
      await (channel as unknown as
        | { permissionOverwrites?: { delete(id: string, reason?: string): Promise<unknown> } }
        | undefined)?.permissionOverwrites?.delete(extra, "[ANTI-RAID]").catch(() => null);
    },
  });
}
