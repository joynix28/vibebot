import type { Guild } from "discord.js";
import { getProtectConfig, saveProtectConfig } from "../db.ts";
import { FLAGS_V2, msgPanel } from "../../../../core/ui.ts";

// Mode raid automatique : s'enclenche quand trop de membres rejoignent
// (config antispam.autoraidmode / autoraidLimit) ou quand un spam massif
// multi-comptes est détecté.

const WINDOW_MS = 10_000;

const joinTimes = new Map<string, number[]>();
const spamSignals = new Map<string, { users: Set<string>; resetAt: number }>();

function pruneJoins(guildId: string, now: number): number[] {
  const list = (joinTimes.get(guildId) ?? []).filter((t) => now - t < WINDOW_MS);
  joinTimes.set(guildId, list);
  return list;
}

/** Enregistre une arrivée ; retourne true si le mode raid doit s'enclencher. */
export function trackJoin(guildId: string): boolean {
  const cfg = getProtectConfig(guildId);
  if (!cfg.antispam.autoraidmode || cfg.raidmode) return false;
  const now = Date.now();
  const list = pruneJoins(guildId, now);
  list.push(now);
  joinTimes.set(guildId, list);
  return list.length > cfg.antispam.autoraidLimit;
}

/** Enregistre un signal de spam ; retourne true si le mode raid doit s'enclencher. */
export function trackSpamSignal(guildId: string, userId: string): boolean {
  const cfg = getProtectConfig(guildId);
  if (!cfg.antispam.autoraidmode || cfg.raidmode) return false;
  const now = Date.now();
  let sig = spamSignals.get(guildId);
  if (!sig || sig.resetAt < now) {
    sig = { users: new Set<string>(), resetAt: now + WINDOW_MS };
    spamSignals.set(guildId, sig);
  }
  sig.users.add(userId);
  return sig.users.size > cfg.antispam.autoraidLimit;
}

/** Active le mode raid et prévient (salon système + salon de logs antiraid). */
export async function enableRaidmode(guild: Guild, reason: string): Promise<void> {
  const cfg = getProtectConfig(guild.id);
  if (cfg.raidmode) return;
  cfg.raidmode = true;
  saveProtectConfig(guild.id, cfg);
  joinTimes.delete(guild.id);
  spamSignals.delete(guild.id);

  const alert = {
    components: [
      msgPanel(
        `☢️ **Mode raid activé automatiquement** (${reason}). Les nouveaux membres non exemptés seront sanctionnés à leur arrivée.`,
      ),
    ],
    flags: FLAGS_V2,
  };

  const sys = guild.systemChannel;
  if (sys?.isTextBased()) await sys.send(alert).catch(() => null);

  const logChannel = cfg.logs.antiraid ? guild.channels.cache.get(cfg.logs.antiraid) : null;
  if (logChannel?.isTextBased() && logChannel.id !== sys?.id) {
    await logChannel.send(alert).catch(() => null);
  }
}
