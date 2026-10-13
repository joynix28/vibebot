import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry, GuildBasedChannel } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";
import { getCachedChannelData } from "../../func/antiraid/channelCache.ts";

export const name = Events.GuildAuditLogEntryCreate;

/** Accès structurel aux opérations de restauration (les unions de salons discord.js sont verbeuses). */
interface ChannelEditor {
  edit(options: Record<string, unknown>): Promise<unknown>;
  setParent(parent: string | null, options?: Record<string, unknown>): Promise<unknown>;
  setPosition(position: number, options?: Record<string, unknown>): Promise<unknown>;
  permissionOverwrites?: {
    cache: { keys(): Iterable<string> };
    edit(id: string, options: Record<string, unknown>, options2?: Record<string, unknown>): Promise<unknown>;
    delete(id: string, reason?: string): Promise<unknown>;
  };
}

const asEditor = (c: GuildBasedChannel): ChannelEditor => c as unknown as ChannelEditor;

function findChange(e: GuildAuditLogsEntry, key: string) {
  return e.changes?.find((c) => c.key === key);
}

function hasRelevantChange(e: GuildAuditLogsEntry): boolean {
  return [
    "position",
    "parent_id",
    "permission_overwrites",
    "name",
    "topic",
    "nsfw",
    "rate_limit_per_user",
    "bitrate",
    "user_limit",
    "rtc_region",
    "default_auto_archive_duration",
  ].some((k) => findChange(e, k) !== undefined);
}

function actionLabel(e: GuildAuditLogsEntry): string {
  const parts: string[] = [];
  if (findChange(e, "position")) parts.push("déplacé un salon");
  if (findChange(e, "parent_id")) parts.push("changé la catégorie d'un salon");
  if (findChange(e, "permission_overwrites")) parts.push("modifié les permissions d'un salon");
  if (
    findChange(e, "name") ||
    findChange(e, "topic") ||
    findChange(e, "nsfw") ||
    findChange(e, "rate_limit_per_user") ||
    findChange(e, "bitrate") ||
    findChange(e, "user_limit") ||
    findChange(e, "rtc_region") ||
    findChange(e, "default_auto_archive_duration")
  ) {
    parts.push("modifié un salon");
  }
  return [...new Set(parts)].join(" / ") || "modifié un salon";
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.ChannelUpdate, {
    actionKey: actionLabel,
    preCheck: hasRelevantChange,
    revert: async (e, g) => {
      const targetId = e.targetId;
      if (!targetId) return;
      const channel = g.channels.cache.get(targetId);
      if (!channel) return;
      const ed = asEditor(channel);

      const positionChange = findChange(e, "position");
      const parentChange = findChange(e, "parent_id");
      const permissionChange = findChange(e, "permission_overwrites");
      const nameChange = findChange(e, "name");
      const topicChange = findChange(e, "topic");
      const nsfwChange = findChange(e, "nsfw");
      const slowmodeChange = findChange(e, "rate_limit_per_user");
      const bitrateChange = findChange(e, "bitrate");
      const userLimitChange = findChange(e, "user_limit");
      const rtcChange = findChange(e, "rtc_region");
      const archiveChange = findChange(e, "default_auto_archive_duration");

      const cached = getCachedChannelData(targetId, channel);

      const restoreOptions: Record<string, unknown> = {};
      if (nameChange) restoreOptions.name = (nameChange.old as string | undefined) ?? cached.name;
      if (topicChange) restoreOptions.topic = (topicChange.old as string | undefined) ?? cached.topic ?? null;
      if (nsfwChange) restoreOptions.nsfw = (nsfwChange.old as boolean | undefined) ?? cached.nsfw ?? false;
      if (slowmodeChange) {
        restoreOptions.rateLimitPerUser =
          (slowmodeChange.old as number | undefined) ?? cached.rateLimitPerUser ?? 0;
      }
      if (bitrateChange) restoreOptions.bitrate = (bitrateChange.old as number | undefined) ?? cached.bitrate ?? undefined;
      if (userLimitChange) {
        restoreOptions.userLimit = (userLimitChange.old as number | undefined) ?? cached.userLimit ?? undefined;
      }
      if (rtcChange) restoreOptions.rtcRegion = (rtcChange.old as string | undefined) ?? cached.rtcRegion ?? null;
      if (archiveChange) {
        restoreOptions.defaultAutoArchiveDuration =
          (archiveChange.old as number | undefined) ?? cached.defaultAutoArchiveDuration ?? undefined;
      }

      if (Object.keys(restoreOptions).length > 0) {
        await ed.edit({ ...restoreOptions, reason: "Anti Channel - Restore" }).catch(() => null);
      }

      if (permissionChange) {
        const rawOld = Array.isArray(permissionChange.old) ? permissionChange.old : null;
        const oldOverwrites: Array<{ id: string; allow: string; deny: string }> =
          rawOld && rawOld.length > 0
            ? (rawOld as Array<{ id: string; allow: string; deny: string }>)
            : cached.permissionOverwrites;

        for (const ow of oldOverwrites) {
          await ed.permissionOverwrites
            ?.edit(
              ow.id,
              { allow: BigInt(ow.allow || 0), deny: BigInt(ow.deny || 0) },
              { reason: "Anti Channel - Restore Permissions" },
            )
            .catch(() => null);
        }

        const oldIds = new Set(oldOverwrites.map((o) => o.id));
        const rawNew = Array.isArray(permissionChange.new)
          ? (permissionChange.new as Array<{ id: string }>)
          : [];
        for (const ow of rawNew) {
          if (!oldIds.has(ow.id)) {
            await ed.permissionOverwrites?.delete(ow.id, "Anti Channel - Restore Permissions").catch(() => null);
          }
        }

        // Purger tout overwrite absent de l'état d'origine
        for (const id of ed.permissionOverwrites?.cache.keys() ?? []) {
          if (!oldIds.has(id)) {
            await ed.permissionOverwrites?.delete(id, "Anti Channel - Restore Permissions").catch(() => null);
          }
        }
      }

      if (parentChange) {
        const targetParent = (parentChange.old as string | null | undefined) ?? cached.parentId ?? null;
        await ed.setParent(targetParent, { lockPermissions: false, reason: "Anti Channel - Restore Category" }).catch(() => null);
      }

      if (positionChange) {
        const targetPosition = (positionChange.old as number | undefined) ?? cached.position ?? undefined;
        if (targetPosition !== undefined) {
          await ed.setPosition(targetPosition, { reason: "Anti Channel - Restore Position" }).catch(() => null);
        }
      }
    },
  });
}
