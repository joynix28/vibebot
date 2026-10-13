import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";
import { getDangerousAddedRoles } from "../../func/antiraid/roleSafety.ts";

export const name = Events.GuildAuditLogEntryCreate;

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.MemberRoleUpdate, {
    actionKey: (e) => `donné un rôle dangereux à <@${e.targetId ?? "?"}>`,
    // Une attribution de rôle inoffensive (ou un retrait) ne déclenche rien.
    preCheck: async (e, g) => (await getDangerousAddedRoles(g, e)).length > 0,
    revert: async (e, g) => {
      const dangerousRoles = await getDangerousAddedRoles(g, e);
      if (!dangerousRoles.length || !e.targetId) return;
      const target =
        g.members.cache.get(e.targetId) ?? (await g.members.fetch(e.targetId).catch(() => null));
      await target?.roles
        .remove(
          dangerousRoles.map((r) => r.id),
          "[ANTI-RAID]",
        )
        .catch(() => null);
    },
  });
}
