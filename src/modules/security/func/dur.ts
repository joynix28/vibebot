const MULT = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 } as const;

export function parseDur(input: string): number | null {
  const m = /^(\d+)([smhdw])$/.exec(input.trim().toLowerCase());
  if (!m) return null;
  return Number(m[1]) * MULT[m[2] as keyof typeof MULT];
}

export function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
}
