import { AuditLogEvent, ChannelType } from "discord.js";
import type { Guild, GuildAuditLogsEntry, GuildBasedChannel, GuildChannelCreateOptions } from "discord.js";

// Cache structure des salons pour l'anti-raid salons.
// Source de vérité pour la restauration post-raid.
// Adapté de NdProtect : les maps vivent ici (module) au lieu d'être
// attachées à l'objet client.

export interface CachedOverwrite {
  id: string;
  allow: string;
  deny: string;
  type: number;
}

export interface CachedChannelData {
  id: string;
  name: string;
  type: ChannelType;
  position: number;
  parentId: string | null;
  topic: string | null;
  nsfw: boolean;
  bitrate: number | null;
  userLimit: number | null;
  rateLimitPerUser: number | null;
  rtcRegion: string | null;
  videoQualityMode: number | null;
  defaultAutoArchiveDuration: number | null;
  permissionOverwrites: CachedOverwrite[];
  availableTags?: Array<{
    id: string;
    name: string;
    moderated: boolean;
    emoji: { id: string | null; name: string | null } | null;
  }>;
  defaultReactionEmoji?: { id: string | null; name: string | null } | null;
  defaultSortOrder?: number | null;
  defaultForumLayout?: number | null;
  defaultThreadRateLimitPerUser?: number | null;
}

/** Vue structurelle minimale d'un salon discord.js (les sous-types exposent des props différentes). */
interface ChannelLike {
  id: string;
  name: string;
  type: ChannelType;
  rawPosition?: number;
  position?: number;
  parentId?: string | null;
  topic?: string | null;
  nsfw?: boolean;
  bitrate?: number;
  userLimit?: number;
  rateLimitPerUser?: number;
  rtcRegion?: string | null;
  videoQualityMode?: number | null;
  defaultAutoArchiveDuration?: number | null;
  permissionOverwrites?: {
    cache: { values(): Iterable<{ id: string; allow: { bitfield: bigint }; deny: { bitfield: bigint }; type: number }> };
  };
  availableTags?: Array<{
    id: string;
    name: string;
    moderated: boolean;
    emoji: { id: string | null; name: string | null } | null;
  }>;
  defaultReactionEmoji?: { id: string | null; name: string | null } | null;
  defaultSortOrder?: number | null;
  defaultForumLayout?: number | null;
  defaultThreadRateLimitPerUser?: number | null;
  isThread?: () => boolean;
}

const like = (c: GuildBasedChannel): ChannelLike => c as unknown as ChannelLike;

export interface RestoreItem {
  targetId: string;
  data: CachedChannelData;
  children: CachedChannelData[] | null;
}

export interface ChannelCreateOptions {
  name: string;
  type: ChannelType;
  topic?: string;
  nsfw?: boolean;
  bitrate?: number;
  userLimit?: number;
  rateLimitPerUser?: number;
  rtcRegion?: string | null;
  videoQualityMode?: number | null;
  defaultAutoArchiveDuration?: number | null;
  parent?: string;
  position?: number;
  permissionOverwrites?: Array<{ id: string; allow: bigint; deny: bigint; type: number }>;
  reason?: string;
  availableTags?: Array<{ name: string; moderated: boolean; emoji?: { id: string | null; name: string | null } }>;
  defaultReactionEmoji?: { id: string | null; name: string | null };
  defaultSortOrder?: number | null;
  defaultForumLayout?: number | null;
  defaultThreadRateLimitPerUser?: number | null;
}

const positions = new Map<string, number>();
const permsCache = new Map<string, CachedOverwrite[]>();
const categoryOf = new Map<string, string | null>();
const childrenOf = new Map<string, CachedChannelData[]>();
const fullCache = new Map<string, CachedChannelData>();
const restoreQueue = new Map<string, RestoreItem[]>();
const restoreTimers = new Map<string, ReturnType<typeof setTimeout>>();
const restoreInProgress = new Map<string, boolean>();
const restorePending = new Map<string, RestoreItem[]>();

const DEFAULT_RESTORE_DEBOUNCE_MS = 2000;

function serializeOverwrites(ch: ChannelLike): CachedOverwrite[] {
  const cache = ch.permissionOverwrites?.cache;
  if (!cache) return [];
  return [...cache.values()].map((o) => ({
    id: o.id,
    allow: o.allow.bitfield.toString(),
    deny: o.deny.bitfield.toString(),
    type: o.type,
  }));
}

/** Snapshot complet d'un salon (toutes propriétés restaurables). */
export function serializeChannel(channel: GuildBasedChannel): CachedChannelData | null {
  const ch = like(channel);
  if (!ch) return null;

  const data: CachedChannelData = {
    id: ch.id,
    name: ch.name,
    type: ch.type,
    position: ch.rawPosition ?? ch.position ?? 0,
    parentId: ch.parentId ?? null,
    topic: typeof ch.topic === "string" ? ch.topic : null,
    nsfw: Boolean(ch.nsfw),
    bitrate: typeof ch.bitrate === "number" ? ch.bitrate : null,
    userLimit: typeof ch.userLimit === "number" ? ch.userLimit : null,
    rateLimitPerUser: typeof ch.rateLimitPerUser === "number" ? ch.rateLimitPerUser : null,
    rtcRegion: ch.rtcRegion ?? null,
    videoQualityMode: ch.videoQualityMode ?? null,
    defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration ?? null,
    permissionOverwrites: serializeOverwrites(ch),
  };

  if (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildMedia) {
    data.availableTags = (ch.availableTags ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      moderated: Boolean(t.moderated),
      emoji: t.emoji ? { id: t.emoji.id ?? null, name: t.emoji.name ?? null } : null,
    }));
    data.defaultReactionEmoji = ch.defaultReactionEmoji
      ? { id: ch.defaultReactionEmoji.id ?? null, name: ch.defaultReactionEmoji.name ?? null }
      : null;
    data.defaultSortOrder = ch.defaultSortOrder ?? null;
    data.defaultForumLayout = ch.defaultForumLayout ?? null;
    data.defaultThreadRateLimitPerUser = ch.defaultThreadRateLimitPerUser ?? null;
  }

  return data;
}

/** (Re)construit le cache pour tous les salons d'un serveur. */
export function hydrateGuildChannelCache(guild: Guild): void {
  const channels = [...guild.channels.cache.values()].filter((c) => !(like(c).isThread?.() ?? false));

  for (const channel of channels) {
    const data = serializeChannel(channel);
    if (!data) continue;
    positions.set(channel.id, data.position);
    permsCache.set(channel.id, data.permissionOverwrites);
    fullCache.set(channel.id, data);

    if (channel.type === ChannelType.GuildCategory) {
      const kids = channels
        .filter((c) => like(c).parentId === channel.id)
        .sort((a, b) => (like(a).rawPosition ?? like(a).position ?? 0) - (like(b).rawPosition ?? like(b).position ?? 0));
      const serialized: CachedChannelData[] = [];
      for (const k of kids) {
        const s = serializeChannel(k);
        if (s) serialized.push(s);
      }
      childrenOf.set(channel.id, serialized);
    } else {
      categoryOf.set(channel.id, like(channel).parentId ?? null);
    }
  }
}

export function rememberChannel(channel: GuildBasedChannel): void {
  const ch = like(channel);
  const data = serializeChannel(channel);
  if (!data) return;
  positions.set(ch.id, data.position);
  permsCache.set(ch.id, data.permissionOverwrites);
  fullCache.set(ch.id, data);

  if (ch.type === ChannelType.GuildCategory) {
    if (!childrenOf.has(ch.id)) childrenOf.set(ch.id, []);
  } else {
    categoryOf.set(ch.id, ch.parentId ?? null);
    if (ch.parentId) {
      const siblings = childrenOf.get(ch.parentId) ?? [];
      const idx = siblings.findIndex((c) => c.id === ch.id || (c.name === ch.name && c.type === ch.type));
      if (idx === -1) siblings.push(data);
      else siblings[idx] = data;
      childrenOf.set(ch.parentId, siblings);
    }
  }
}

export function forgetChannel(channelId: string, type?: ChannelType, parentId: string | null = null): void {
  const cachedParent = parentId ?? categoryOf.get(channelId) ?? null;
  const wasCategory = type === ChannelType.GuildCategory || childrenOf.has(channelId);

  if (wasCategory) {
    const children = childrenOf.get(channelId) ?? [];
    childrenOf.delete(channelId);
    for (const child of children) {
      categoryOf.delete(child.id);
      positions.delete(child.id);
      permsCache.delete(child.id);
      fullCache.delete(child.id);
    }
  } else if (cachedParent) {
    const siblings = childrenOf.get(cachedParent) ?? [];
    const idx = siblings.findIndex((c) => c.id === channelId);
    if (idx !== -1) siblings.splice(idx, 1);
    childrenOf.set(cachedParent, siblings);
    categoryOf.delete(channelId);
  } else {
    categoryOf.delete(channelId);
  }

  positions.delete(channelId);
  permsCache.delete(channelId);
  fullCache.delete(channelId);
}

export function getCachedChannelData(channelId: string, fallback: GuildBasedChannel | null = null): CachedChannelData {
  const full = fullCache.get(channelId);
  if (full) return { ...full, permissionOverwrites: [...full.permissionOverwrites] };

  const fb = fallback ? like(fallback) : null;
  const permissions = permsCache.get(channelId) ?? [];
  const position = positions.get(channelId) ?? fb?.rawPosition ?? fb?.position ?? 0;
  const parentId = categoryOf.get(channelId) ?? fb?.parentId ?? null;

  return {
    id: channelId,
    name: fb?.name ?? "salon_restauré",
    type: fb?.type ?? ChannelType.GuildText,
    position,
    parentId,
    topic: fb?.topic ?? null,
    nsfw: fb?.nsfw ?? false,
    bitrate: fb?.bitrate ?? null,
    userLimit: fb?.userLimit ?? null,
    rateLimitPerUser: fb?.rateLimitPerUser ?? null,
    rtcRegion: fb?.rtcRegion ?? null,
    videoQualityMode: fb?.videoQualityMode ?? null,
    defaultAutoArchiveDuration: fb?.defaultAutoArchiveDuration ?? null,
    permissionOverwrites: permissions,
  };
}

/** Enfants en cache d'une catégorie (pour la restauration). */
export function getCachedChildren(categoryId: string): CachedChannelData[] {
  return [...(childrenOf.get(categoryId) ?? [])].map((c) => ({ ...c }));

}

export function buildCreateOptionsFromCache(data: CachedChannelData, parentId: string | null = null): ChannelCreateOptions {
  const options: ChannelCreateOptions = {
    name: data.name || "salon_restauré",
    type: data.type,
    topic: data.topic ?? undefined,
    nsfw: data.nsfw ?? false,
    bitrate: data.bitrate ?? undefined,
    userLimit: data.userLimit ?? undefined,
    rateLimitPerUser: data.rateLimitPerUser ?? undefined,
    rtcRegion: data.rtcRegion ?? undefined,
    videoQualityMode: data.videoQualityMode ?? undefined,
    defaultAutoArchiveDuration: data.defaultAutoArchiveDuration ?? undefined,
    parent: parentId ?? undefined,
    position: data.position,
    permissionOverwrites: (data.permissionOverwrites || []).map((o) => ({
      id: o.id,
      allow: BigInt(o.allow || 0),
      deny: BigInt(o.deny || 0),
      type: o.type,
    })),
    reason: "Anti Channel - Restore",
  };

  if (data.type === ChannelType.GuildForum || data.type === ChannelType.GuildMedia) {
    if (Array.isArray(data.availableTags)) {
      options.availableTags = data.availableTags.map((t) => ({
        name: t.name,
        moderated: Boolean(t.moderated),
        emoji: t.emoji ?? undefined,
      }));
    }
    if (data.defaultReactionEmoji) options.defaultReactionEmoji = data.defaultReactionEmoji;
    if (data.defaultSortOrder != null) options.defaultSortOrder = data.defaultSortOrder;
    if (data.defaultForumLayout != null) options.defaultForumLayout = data.defaultForumLayout;
    if (data.defaultThreadRateLimitPerUser != null) {
      options.defaultThreadRateLimitPerUser = data.defaultThreadRateLimitPerUser;
    }
  }

  return options;
}

// ---- File de restauration (antiChannelDelete) ----

async function createWithRetry(guild: Guild, options: ChannelCreateOptions, attempts = 3): Promise<GuildBasedChannel | null> {
  let lastError: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return (await guild.channels.create(options as unknown as GuildChannelCreateOptions)) as GuildBasedChannel;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  throw lastError;
}

async function applyPositions(guild: Guild, desired: Array<{ id: string; position: number }>): Promise<void> {
  const payload: Array<{ channel: string; position: number }> = [];
  for (const item of desired) {
    if (!item?.id || item.position == null) continue;
    if (!guild.channels.cache.has(item.id)) continue;
    payload.push({ channel: item.id, position: item.position });
  }
  if (!payload.length) return;
  if (typeof guild.channels.setPositions === "function") {
    await guild.channels.setPositions(payload).catch(async () => {
      for (const p of payload) {
        const ch = guild.channels.cache.get(p.channel);
        await (ch as unknown as { setPosition?: (n: number) => Promise<unknown> } | undefined)?.setPosition?.(
          p.position,
        ).catch(() => null);
      }
    });
  } else {
    for (const p of payload) {
      const ch = guild.channels.cache.get(p.channel);
      await (ch as unknown as { setPosition?: (n: number) => Promise<unknown> } | undefined)?.setPosition?.(
        p.position,
      ).catch(() => null);
    }
  }
}

async function restoreBatch(guild: Guild): Promise<void> {
  const items = restoreQueue.get(guild.id) ?? [];
  restoreQueue.delete(guild.id);
  restoreTimers.delete(guild.id);

  if (!items.length) return;

  restoreInProgress.set(guild.id, true);

  try {
    items.sort((a, b) => {
      const aIsCat = a.data?.type === ChannelType.GuildCategory;
      const bIsCat = b.data?.type === ChannelType.GuildCategory;
      if (aIsCat !== bIsCat) return aIsCat ? -1 : 1;
      return (a.data?.position ?? 0) - (b.data?.position ?? 0);
    });

    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      if (seen.has(item.targetId)) return false;
      seen.add(item.targetId);
      return true;
    });

    const categoryIdsInQueue = new Set(
      deduped.filter((i) => i.data?.type === ChannelType.GuildCategory).map((i) => i.targetId),
    );

    // Les enfants d'une catégorie aussi en file sont restaurés via la catégorie
    const filtered = deduped.filter((item) => {
      if (item.data?.type === ChannelType.GuildCategory) return true;
      return !categoryIdsInQueue.has(item.data?.parentId ?? "");
    });

    const idMap = new Map<string, GuildBasedChannel>(); // oldId -> newChannel

    for (const item of filtered) {
      const data = item.data;
      const oldParentId = data.parentId ?? null;
      const resolvedParent = oldParentId
        ? (idMap.get(oldParentId) ?? guild.channels.cache.get(oldParentId) ?? null)
        : null;

      let channel = guild.channels.cache.get(item.targetId) ?? idMap.get(item.targetId) ?? null;

      if (channel) {
        const ch = like(channel);
        if (resolvedParent && ch.parentId !== resolvedParent.id) {
          await (channel as unknown as { setParent(id: string | null, o?: Record<string, unknown>): Promise<unknown> })
            .setParent(resolvedParent.id, { lockPermissions: false, reason: "Anti Channel - Restore Parent" })
            .catch(() => null);
        } else if (!oldParentId && ch.parentId) {
          await (channel as unknown as { setParent(id: string | null, o?: Record<string, unknown>): Promise<unknown> })
            .setParent(null, { lockPermissions: false, reason: "Anti Channel - Restore Parent" })
            .catch(() => null);
        }
        idMap.set(item.targetId, channel);
        continue;
      }

      const created = await createWithRetry(
        guild,
        buildCreateOptionsFromCache(data, resolvedParent?.id ?? null),
      ).catch(() => null);

      if (!created) continue;

      idMap.set(item.targetId, created);

      // Remplacer les caches de l'ancien ID
      positions.delete(item.targetId);
      categoryOf.delete(item.targetId);
      permsCache.delete(item.targetId);
      fullCache.delete(item.targetId);
      if (data.type === ChannelType.GuildCategory) childrenOf.delete(item.targetId);

      rememberChannel(created);

      if (data.type === ChannelType.GuildCategory) {
        const children = Array.isArray(item.children) ? item.children : [];
        const restoredChildren: CachedChannelData[] = [];

        for (const childData of children) {
          let child = guild.channels.cache.get(childData.id) ?? idMap.get(childData.id) ?? null;

          if (child) {
            await (child as unknown as { setParent(id: string, o?: Record<string, unknown>): Promise<unknown> })
              .setParent(created.id, { lockPermissions: false, reason: "Anti Channel - Restore Parent" })
              .catch(() => null);
            idMap.set(childData.id, child);
          } else {
            child = await createWithRetry(guild, buildCreateOptionsFromCache(childData, created.id)).catch(
              () => null,
            );
            if (!child) continue;
            idMap.set(childData.id, child);

            positions.delete(childData.id);
            categoryOf.delete(childData.id);
            permsCache.delete(childData.id);
            fullCache.delete(childData.id);
          }

          rememberChannel(child);
          const s = serializeChannel(child);
          if (s) restoredChildren.push(s);
        }

        childrenOf.set(created.id, restoredChildren);
      } else if (resolvedParent) {
        const siblings = childrenOf.get(resolvedParent.id) ?? [];
        const idx = siblings.findIndex((c) => c.id === item.targetId || c.id === created.id);
        const s = serializeChannel(created);
        if (s) {
          if (idx !== -1) siblings.splice(idx, 1, s);
          else siblings.push(s);
        }
        childrenOf.set(resolvedParent.id, siblings);
      }
    }

    // Pass finale : positions globales depuis le cache d'origine
    const positionPlan: Array<{ id: string; position: number }> = [];
    for (const item of deduped) {
      const live = idMap.get(item.targetId) ?? guild.channels.cache.get(item.targetId);
      if (!live) continue;
      positionPlan.push({ id: live.id, position: item.data.position ?? 0 });
    }

    for (const item of filtered.filter((i) => i.data?.type === ChannelType.GuildCategory)) {
      const cat = idMap.get(item.targetId);
      if (!cat || !item.children) continue;
      for (const child of item.children) {
        const live = idMap.get(child.id) ?? guild.channels.cache.get(child.id);
        if (!live) continue;
        if (!positionPlan.find((p) => p.id === live.id)) {
          positionPlan.push({ id: live.id, position: child.position ?? 0 });
        }
      }
    }

    await applyPositions(guild, positionPlan);

    for (const p of positionPlan) {
      positions.set(p.id, p.position);
      const full = fullCache.get(p.id);
      if (full) full.position = p.position;
    }
  } finally {
    restoreInProgress.set(guild.id, false);

    // Relancer s'il y a eu des suppressions pendant le restore
    const pending = restorePending.get(guild.id) ?? [];
    if (pending.length) {
      restorePending.delete(guild.id);
      const queue = restoreQueue.get(guild.id) ?? [];
      for (const item of pending) {
        if (!queue.some((q) => q.targetId === item.targetId)) queue.push(item);
      }
      restoreQueue.set(guild.id, queue);
      scheduleRestore(guild);
    }
  }
}

function scheduleRestore(guild: Guild): void {
  const prev = restoreTimers.get(guild.id);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    restoreBatch(guild).catch(() => {
      restoreInProgress.set(guild.id, false);
    });
  }, DEFAULT_RESTORE_DEBOUNCE_MS);
  restoreTimers.set(guild.id, timer);
}

/** Planifie la restauration d'un salon supprimé (debounce 2s). */
export function enqueueRestore(guild: Guild, item: RestoreItem): void {
  if (restoreInProgress.get(guild.id)) {
    const pending = restorePending.get(guild.id) ?? [];
    if (!pending.some((q) => q.targetId === item.targetId)) pending.push(item);
    restorePending.set(guild.id, pending);
    return;
  }

  const queue = restoreQueue.get(guild.id) ?? [];
  if (!queue.some((q) => q.targetId === item.targetId)) queue.push(item);
  restoreQueue.set(guild.id, queue);
  scheduleRestore(guild);
}

// ---- Actions de confiance (ex-trustedChannelAction) ----
// Quand l'exécuteur est exempté (bot lui-même, owner, whitelist), on
// synchronise le cache au lieu de sanctionner.

export function syncTrustedChannelAction(entry: GuildAuditLogsEntry, guild: Guild): void {
  const targetId = entry.targetId;
  if (!targetId) return;
  const target = entry.target as unknown as {
    id?: string;
    type?: ChannelType;
    parentId?: string | null;
  } | null;

  switch (entry.action) {
    case AuditLogEvent.ChannelCreate: {
      const live = guild.channels.cache.get(targetId);
      if (live) rememberChannel(live);
      break;
    }

    case AuditLogEvent.ChannelDelete: {
      forgetChannel(targetId, target?.type, target?.parentId ?? categoryOf.get(targetId) ?? null);
      break;
    }

    case AuditLogEvent.ChannelUpdate: {
      const changes = (entry.changes ?? []) as Array<{ key: string; old?: unknown; new?: unknown }>;
      const positionChange = changes.find((c) => c.key === "position");
      const parentChange = changes.find((c) => c.key === "parent_id");
      const permissionChange = changes.find((c) => c.key === "permission_overwrites");

      if (positionChange) {
        const pos = Number(positionChange.new ?? 0);
        positions.set(targetId, pos);
        const full = fullCache.get(targetId);
        if (full) full.position = pos;

        const parentId = categoryOf.get(targetId);
        if (parentId) {
          const siblings = childrenOf.get(parentId) ?? [];
          const child = siblings.find((c) => c.id === targetId);
          if (child) child.position = pos;
        }
      }

      if (parentChange) {
        const oldParent = (parentChange.old as string | null | undefined) ?? null;
        const newParent = (parentChange.new as string | null | undefined) ?? null;
        categoryOf.set(targetId, newParent);

        const full = fullCache.get(targetId);
        if (full) full.parentId = newParent;

        const oldSiblings = childrenOf.get(oldParent ?? "") ?? [];
        const idx = oldSiblings.findIndex((c) => c.id === targetId);
        const childData =
          idx !== -1 ? (oldSiblings.splice(idx, 1)[0] as CachedChannelData) : full ? { ...full } : { id: targetId };
        if (oldParent) childrenOf.set(oldParent, oldSiblings);

        if (newParent) {
          const newSiblings = childrenOf.get(newParent) ?? [];
          if (!newSiblings.find((c) => c.id === targetId) && "name" in childData) {
            newSiblings.push(childData as CachedChannelData);
          }
          childrenOf.set(newParent, newSiblings);
        }
      }

      if (permissionChange) {
        const overwrites = (
          Array.isArray(permissionChange.new)
            ? (permissionChange.new as Array<{ id: string; allow?: unknown; deny?: unknown; type?: number }>)
            : []
        ).map((o) => ({
          id: o.id,
          allow: String(o.allow ?? 0),
          deny: String(o.deny ?? 0),
          type: o.type ?? 0,
        }));
        permsCache.set(targetId, overwrites);
        const full = fullCache.get(targetId);
        if (full) full.permissionOverwrites = overwrites;
      }

      // Si on a le salon live, resynchroniser le snapshot complet
      const live = guild.channels.cache.get(targetId);
      if (live) rememberChannel(live);
      break;
    }

    default:
      break;
  }
}
