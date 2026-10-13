import { Events } from "discord.js";
import type { Client } from "discord.js";
import bk from "dis-backups";
import { g, sv, ownAdd, ownDel, ownExpired, type Guild } from "../../func/db.ts";

export const name = Events.ClientReady;
export const once = true;

const INT: Record<string, number> = {
  "4h": 4 * 3600000, "8h": 8 * 3600000, "12h": 12 * 3600000, "24h": 24 * 3600000,
  "2d": 2 * 86400000, "3d": 3 * 86400000, "7d": 7 * 86400000, "14d": 14 * 86400000, "30d": 30 * 86400000,
};

export function intMs(key: string): number {
  return INT[key] ?? 0;
}

export function intOn(cfg: Guild, ms: number): void {
  cfg.backup_interval_ms = ms;
  cfg.backup_interval_last = 0;
  sv(cfg);
}

export function intOff(cfg: Guild): void {
  cfg.backup_interval_ms = 0;
  cfg.backup_interval_last = 0;
  sv(cfg);
}

export async function execute(client: Client): Promise<void> {
  const tick = async () => {
    const expired = ownExpired("clipboard-", 60 * 60 * 1000);
    for (const e of expired) {
      ownDel(e.user_id, e.backup_id);
    }

    for (const guild of client.guilds.cache.values()) {
      const cfg = g(guild.id);
      if (!cfg.backup_interval_ms) continue;
      const now = Date.now();
      if (cfg.backup_interval_last && now - cfg.backup_interval_last < cfg.backup_interval_ms) continue;
      try {
        const data = await bk.create(guild, {
          compression: "gzip",
          backupMembers: true,
          jsonBeautify: false,
          maxMessagesPerChannel: 100,
          fetchAllMessages: true,
          saveImages: "url",
        });
        ownAdd(client.user?.id ?? "", data.id);
        cfg.backup_interval_last = now;
        sv(cfg);
        console.log(`[interval] backup ${data.id} created for ${guild.id}`);
      } catch (err) {
        console.error(`[interval] failed for ${guild.id}`, err);
      }
    }
  };
  await tick();
  setInterval(tick, 60_000);
}
