import { AuditLogEvent, Events } from "discord.js";
import type { Guild, GuildAuditLogsEntry } from "discord.js";
import { handleAntiraidAuditEntry } from "../../func/antiraid/handler.ts";

export const name = Events.GuildAuditLogEntryCreate;

async function imageBuffer(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function execute(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  await handleAntiraidAuditEntry(entry, guild, AuditLogEvent.GuildUpdate, {
    actionKey: "modifié le serveur",
    revert: async (e, g) => {
      const changes = e.changes ?? [];
      const getOld = (key: string): unknown => changes.find((k) => k.key === key)?.old;

      // Restaure les images depuis l'ancien hash (ou l'image actuelle en repli).
      // Contrairement à la source (qui passait une URL, rejetée par l'API),
      // on télécharge l'image pour fournir un buffer valide.
      const oldIcon = getOld("icon_hash") as string | undefined;
      const oldSplash = getOld("splash_hash") as string | undefined;
      const oldBanner = getOld("banner_hash") as string | undefined;
      const [icon, splash, banner] = await Promise.all([
        imageBuffer(
          oldIcon ? `https://cdn.discordapp.com/icons/${g.id}/${oldIcon}.png?size=1024` : g.iconURL({ size: 1024 }),
        ),
        imageBuffer(
          oldSplash
            ? `https://cdn.discordapp.com/splashes/${g.id}/${oldSplash}.png?size=1024`
            : g.splashURL({ size: 1024 }),
        ),
        imageBuffer(
          oldBanner
            ? `https://cdn.discordapp.com/banners/${g.id}/${oldBanner}.png?size=1024`
            : g.bannerURL({ size: 1024 }),
        ),
      ]);

      const editOptions: Record<string, unknown> = {
        name: (getOld("name") as string | undefined) ?? g.name,
        description: (getOld("description") as string | undefined) ?? g.description,
        verificationLevel: (getOld("verification_level") as number | undefined) ?? g.verificationLevel,
        defaultMessageNotifications:
          (getOld("default_message_notifications") as number | undefined) ?? g.defaultMessageNotifications,
        explicitContentFilter:
          (getOld("explicit_content_filter") as number | undefined) ?? g.explicitContentFilter,
        afkChannelId: (getOld("afk_channel_id") as string | null | undefined) ?? g.afkChannelId,
        afkTimeout: (getOld("afk_timeout") as number | undefined) ?? g.afkTimeout,
        systemChannelId: (getOld("system_channel_id") as string | null | undefined) ?? g.systemChannelId,
        rulesChannelId: (getOld("rules_channel_id") as string | null | undefined) ?? g.rulesChannelId,
        publicUpdatesChannelId:
          (getOld("public_updates_channel_id") as string | null | undefined) ?? g.publicUpdatesChannelId,
        systemChannelFlags: (getOld("system_channel_flags") as number | undefined) ?? g.systemChannelFlags,
        preferredLocale: (getOld("preferred_locale") as string | undefined) ?? g.preferredLocale,
      };
      if (icon) editOptions.icon = icon;
      if (splash) editOptions.splash = splash;
      if (banner) editOptions.banner = banner;

      if (typeof g.edit === "function") {
        await (g.edit as (o: Record<string, unknown>) => Promise<unknown>)(editOptions).catch(() => null);
      }
    },
  });
}
