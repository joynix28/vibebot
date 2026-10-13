// Mathématiques des niveaux, reprises du bot legacy (shared/xp.js).
// Les cartes canvas (@napi-rs/canvas) ne sont pas disponibles sous Bun :
// le rendu se fait en panneau Components V2 avec une barre de progression texte.

const THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700];
const STEP_AFTER = 500;

/** XP cumulée requise pour atteindre un niveau donné. */
export function thresholdForLevel(level: number): number {
  if (level < THRESHOLDS.length) return THRESHOLDS[level]!;
  const last = THRESHOLDS.length - 1;
  return THRESHOLDS[last]! + (level - last) * STEP_AFTER;
}

/** Niveau correspondant à une quantité d'XP. */
export function levelFromXp(xp: number): number {
  const safe = Math.max(0, Math.floor(xp));
  let level = 0;
  while (safe >= thresholdForLevel(level + 1)) level++;
  return level;
}

export interface XpProgress {
  level: number;
  start: number;
  end: number;
  inLevel: number;
  span: number;
  percent: number;
  totalXp: number;
}

/** Progression détaillée dans le niveau courant. */
export function progressFromXp(xp: number): XpProgress {
  const safe = Math.max(0, Math.floor(xp));
  const level = levelFromXp(safe);
  const start = thresholdForLevel(level);
  const end = thresholdForLevel(level + 1);
  const span = Math.max(1, end - start);
  const inLevel = safe - start;
  const percent = Math.min(100, Math.max(0, Math.round((inLevel / span) * 100)));
  return { level, start, end, inLevel, span, percent, totalXp: safe };
}

/** Barre de progression texte, ex. `▰▰▰▰▱▱▱▱▱▱ 40%`. */
export function progressBar(percent: number, width = 12): string {
  const filled = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
  return `${"▰".repeat(filled)}${"▱".repeat(width - filled)} ${percent}%`;
}
