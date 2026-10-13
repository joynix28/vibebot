import { AuditLogEvent, Events, PermissionsBitField } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

function previousBits(e: GuildAuditLogsEntry, key: string): bigint {
  const v = e.changes?.find((c) => c.key === key)?.old as string | number | bigint | undefined;
  try {
    return BigInt(v ?? 0);
  } catch {
    return 0n;
  }
}

/** Restaure l'overwrite à son état précédent (allow/deny d'origine). */
async function restoreOverwrite(e: GuildAuditLogsEntry, g: Guild): Promise<void> {
  const targetId = e.targetId;
  const extra = e.extra as unknown as string | undefined;
  if (!targetId || !extra) return;
  const channel = g.channels.cache.get(targetId) as unknown as
    | {
        permissionOverwrites?: {
          edit(id: string, options: Record<string, boolean | null>, reason?: string): Promise<unknown>;
        };
      }
    | undefined;
  if (!channel?.permissionOverwrites) return;

  const previousAllow = previousBits(e, "allow");
  const previousDeny = previousBits(e, "deny");

  const submittedPerms: Record<string, boolean | null> = {};
  for (const [perm, value] of Object.entries(PermissionsBitField.Flags)) {
    const bit = value as bigint;
    if ((previousAllow & bit) === bit) submittedPerms[perm] = true;
    else if ((previousDeny & bit) === bit) submittedPerms[perm] = false;
    else submittedPerms[perm] = null;
  }

  await channel.permissionOverwrites.edit(extra, submittedPerms, "[ANTI-RAID]").catch(() => null);
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.ChannelOverwriteDelete, {
    actionKey: "supprimé une permission sur un salon",
    revert: restoreOverwrite,
  });
}
