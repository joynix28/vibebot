// Parsing des durées de giveaway, repris du bot legacy (Utils/giveaway/validate.js).
// Formats acceptés : 30s, 15m, 1h, 2d (et j en français).

const MULT: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  j: 86_400_000,
};

export interface ParsedDuration {
  label: string;
  ms: number;
}

/** Retourne null si le format est invalide. */
export function parseDuration(input: string): ParsedDuration | null {
  const m = String(input).trim().match(/^(\d+)([smhdj])$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  const unit = m[2]!.toLowerCase();
  const ms = n * MULT[unit]!;
  const label = `${n}${unit === "j" ? "j" : unit}`;
  return { label, ms };
}

/** Tirage aléatoire de gagnants parmi une liste de participants. */
export function drawWinners<T>(participants: T[], count: number): T[] {
  const pool = [...participants];
  const winners: T[] = [];
  while (pool.length > 0 && winners.length < count) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]!);
  }
  return winners;
}
