// Rate limiting en mémoire par (guild, module, exécuteur), fenêtre glissante.

export interface RateLimit {
  limit: number;
  windowMs: number;
}

const DEFAULT_NORMAL: RateLimit = { limit: 3, windowMs: 10_000 };
const DEFAULT_BYPASS: RateLimit = { limit: 8, windowMs: 10_000 };

const MODULE_DEFAULTS: Record<string, { normal: RateLimit; bypass: RateLimit }> = {
  antispam: { normal: { limit: 7, windowMs: 10_000 }, bypass: { limit: 15, windowMs: 10_000 } },
  antichannel: { normal: { limit: 5, windowMs: 10_000 }, bypass: { limit: 12, windowMs: 10_000 } },
  antirole: { normal: { limit: 5, windowMs: 10_000 }, bypass: { limit: 12, windowMs: 10_000 } },
  antibot: { normal: { limit: 2, windowMs: 10_000 }, bypass: { limit: 5, windowMs: 10_000 } },
  antiban: { normal: { limit: 3, windowMs: 10_000 }, bypass: { limit: 8, windowMs: 10_000 } },
  antiunban: { normal: { limit: 3, windowMs: 10_000 }, bypass: { limit: 8, windowMs: 10_000 } },
  antikick: { normal: { limit: 5, windowMs: 10_000 }, bypass: { limit: 12, windowMs: 10_000 } },
  antiwebhook: { normal: { limit: 3, windowMs: 10_000 }, bypass: { limit: 8, windowMs: 10_000 } },
  antiupdate: { normal: { limit: 3, windowMs: 10_000 }, bypass: { limit: 8, windowMs: 10_000 } },
  antiemote: { normal: { limit: 5, windowMs: 10_000 }, bypass: { limit: 12, windowMs: 10_000 } },
  antisticker: { normal: { limit: 5, windowMs: 10_000 }, bypass: { limit: 12, windowMs: 10_000 } },
  antirank: { normal: { limit: 8, windowMs: 10_000 }, bypass: { limit: 15, windowMs: 10_000 } },
  antimove: { normal: { limit: 4, windowMs: 60_000 }, bypass: { limit: 10, windowMs: 60_000 } },
  antideco: { normal: { limit: 4, windowMs: 60_000 }, bypass: { limit: 10, windowMs: 60_000 } },
};

const actionLog = new Map<string, { count: number; resetAt: number }>();

export function getLimits(moduleKey: string, bypassUser: boolean): RateLimit {
  const d = MODULE_DEFAULTS[moduleKey];
  const tier = bypassUser ? (d?.bypass ?? DEFAULT_BYPASS) : (d?.normal ?? DEFAULT_NORMAL);
  return { limit: tier.limit, windowMs: tier.windowMs };
}

/** Incrémente le compteur et retourne true si la limite est dépassée. */
export function exceedsLimit(
  guildId: string,
  moduleKey: string,
  userId: string,
  amount: number,
  bypassUser: boolean,
): boolean {
  const { limit, windowMs } = getLimits(moduleKey, bypassUser);
  const add = Math.max(1, Number(amount) || 1);
  if (limit <= 0) return true;

  const key = `${guildId}:${moduleKey}:${userId}`;
  const now = Date.now();
  let entry = actionLog.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    actionLog.set(key, entry);
  }
  entry.count += add;
  return entry.count > limit;
}
