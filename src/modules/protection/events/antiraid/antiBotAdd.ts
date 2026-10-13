import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.BotAdd, {
    actionKey: "ajoute un bot",
    revert: async (e, g) => {
      if (!e.targetId) return;
      const member = g.members.cache.get(e.targetId) ?? (await g.members.fetch(e.targetId).catch(() => null));
      await member?.kick("[ANTI-RAID]").catch(() => null);
    },
  });
}
