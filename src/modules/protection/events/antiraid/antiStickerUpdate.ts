import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.StickerUpdate, {
    actionKey: "modifié un sticker",
    preCheck: (e) => Boolean(e.target && e.changes),
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const target = g.stickers.cache.get(targetId);
      if (!target) return;
      const getOld = (key: string): unknown => e.changes?.find((c) => c.key === key)?.old;
      try {
        await target
          .edit({
            name: (getOld("name") as string | undefined) ?? target.name,
            tags: (getOld("tags") as string | undefined) ?? target.tags ?? undefined,
            description: (getOld("description") as string | undefined) ?? target.description ?? undefined,
          })
          .catch(() => null);
      } catch {
        /* ignore */
      }
    },
  });
}
