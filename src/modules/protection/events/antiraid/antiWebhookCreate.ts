import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.WebhookCreate, {
    actionKey: "crée un webhook",
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const channelId = (e.changes?.find((c) => c.key === "channel_id")?.new as string | undefined) ?? null;
      if (!channelId) return;
      const channel = g.channels.cache.get(channelId);
      if (!channel || !("fetchWebhooks" in channel)) return;
      const webhook = await (
        channel as unknown as {
          fetchWebhooks(): Promise<Map<string, { id: string; delete(reason?: string): Promise<unknown> }>>;
        }
      )
        .fetchWebhooks()
        .then((w) => [...w.values()].find((c) => c.id === targetId) ?? null)
        .catch(() => null);
      if (webhook) await webhook.delete("[ANTI-RAID]").catch(() => null);
    },
  });
}
