import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry, GuildBasedChannel } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";
import { enqueueRestore, getCachedChannelData, getCachedChildren } from "../../func/antiraid/channelCache.ts";
import { ChannelType } from "discord.js";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.ChannelDelete, {
    actionKey: "supprimé un salon",
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const data = getCachedChannelData(targetId, (e.target as unknown as GuildBasedChannel | null) ?? null);
      const children =
        data.type === ChannelType.GuildCategory ? getCachedChildren(targetId) : null;
      enqueueRestore(g, { targetId, data, children });
    },
  });
}
