import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.EmojiCreate, {
    actionKey: "crée un emoji",
    revert: async (e, g) => {
      if (!e.targetId) return;
      await g.emojis.cache.get(e.targetId)?.delete().catch(() => null);
    },
  });
}
