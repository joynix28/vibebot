import { AuditLogEvent, Events, StickerFormatType } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

const FORMAT_EXT: Partial<Record<StickerFormatType, string>> = {
  [StickerFormatType.PNG]: "png",
  [StickerFormatType.APNG]: "png",
  [StickerFormatType.Lottie]: "json",
  [StickerFormatType.GIF]: "gif",
};

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.StickerDelete, {
    actionKey: "supprime un sticker",
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      try {
        const target = e.target as unknown as
          | { name?: string; tags?: string; description?: string; format?: StickerFormatType }
          | null;
        const ext = (target?.format !== undefined ? FORMAT_EXT[target.format] : undefined) ?? "png";
        await g.stickers
          ?.create?.({
            name: target?.name ?? "sticker_restauré",
            tags: target?.tags ?? "",
            file: `https://cdn.discordapp.com/stickers/${targetId}.${ext}`,
            description: target?.description ?? "",
          })
          .catch(() => null);
      } catch {
        /* ignore */
      }
    },
  });
}
