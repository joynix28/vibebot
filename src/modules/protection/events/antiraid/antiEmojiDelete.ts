import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.EmojiDelete, {
    actionKey: "supprimé un emoji",
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      try {
        const base = `https://cdn.discordapp.com/emojis/${targetId}`;
        let attachment = `${base}.png`;
        try {
          const gif = await fetch(`${base}.gif`);
          if (gif.ok) attachment = `${base}.gif`;
        } catch {
          /* ignore */
        }
        const name =
          (e.changes?.find((k) => k.key === "name")?.old as string | undefined) ?? "emoji_restauré";
        await g.emojis.create({ name, attachment }).catch(() => null);
      } catch {
        /* ignore */
      }
    },
  });
}
