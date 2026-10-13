import { AuditLogEvent, ChannelType, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";
import { forgetChannel } from "../../func/antiraid/channelCache.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.ChannelCreate, {
    actionKey: "crée un salon",
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const channel = g.channels.cache.get(targetId);
      const target = e.target as unknown as { type?: ChannelType; parentId?: string | null } | null;
      await channel?.delete("[ANTI-RAID]").catch(() => null);
      try {
        forgetChannel(targetId, target?.type, target?.parentId ?? null);
      } catch {
        /* ignore */
      }
    },
  });
}
