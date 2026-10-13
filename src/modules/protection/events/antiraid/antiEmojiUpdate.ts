import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.EmojiUpdate, {
    actionKey: "modifié un emoji",
    preCheck: (e) => Boolean(e.target && e.changes),
    revert: async (e, g) => {
      if (!e.targetId) return;
      const oldName = e.changes?.find((c) => c.key === "name")?.old as string | undefined;
      if (!oldName) return;
      await g.emojis.cache.get(e.targetId)?.setName(oldName).catch(() => null);
    },
  });
}
