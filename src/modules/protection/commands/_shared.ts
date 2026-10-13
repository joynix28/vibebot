import { ButtonStyle } from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildBasedChannel,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  actionRow,
  button,
  errPanel,
  msgPanel,
} from "../../../core/ui.ts";
import { getProtectConfig, isWhitelisted } from "../func/db.ts";

/**
 * Helpers partagés des commandes du module protection.
 * (Fichier ignoré par le loader : il n'exporte pas `data`.)
 */

export const BLURPLE = 0x5865f2;
/** Durée de validité d'un bouton de confirmation (ms). */
export const CONFIRM_TTL = 60_000;

const DURATION_MULT: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** "30m", "2h", "1d", "1w" (et "45s") -> millisecondes, ou null si invalide. */
export function parseDuration(raw: string): number | null {
  const m = raw.trim().toLowerCase().match(/^(\d+)([smhdw])$/);
  if (!m || !m[1] || !m[2]) return null;
  const mult = DURATION_MULT[m[2]];
  if (!mult) return null;
  return parseInt(m[1], 10) * mult;
}

/** "90 minutes", "2 heures", "3 jours", "1 semaine"... */
export function formatDuration(ms: number): string {
  const units: [number, string, string][] = [
    [604_800_000, "semaine", "semaines"],
    [86_400_000, "jour", "jours"],
    [3_600_000, "heure", "heures"],
    [60_000, "minute", "minutes"],
    [1_000, "seconde", "secondes"],
  ];
  for (const [div, sing, plur] of units) {
    if (ms >= div && ms % div === 0) {
      const n = ms / div;
      return `${n} ${n === 1 ? sing : plur}`;
    }
  }
  return `${Math.round(ms / 1000)} secondes`;
}

export function statusLine(enabled: boolean): string {
  return enabled ? "✅ Activé" : "❌ Désactivé";
}

/** Vrai si l'utilisateur a la permission (raccourci memberPermissions). */
export function hasPerm(interaction: ChatInputCommandInteraction, perm: bigint): boolean {
  return interaction.memberPermissions?.has(perm) ?? false;
}

/** Propriétaire du serveur ou membre de la liste blanche. */
export function isOwnerOrWhitelisted(guild: Guild, userId: string): boolean {
  return guild.ownerId === userId || isWhitelisted(guild.id, guild.ownerId, userId);
}

/** Récupère la guild ou répond une erreur éphémère. */
export async function needGuild(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction
): Promise<Guild | null> {
  if (interaction.guild) return interaction.guild;
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        components: [errPanel("❌ Cette commande ne peut être utilisée que sur un serveur.")],
        flags: FLAGS_V2_EPHEMERAL,
      });
    }
  } catch {}
  return null;
}

/** Réponse d'erreur éphémère (tolère un état déjà répondu). */
export async function replyErr(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
  text: string
): Promise<void> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ components: [errPanel(text)], flags: FLAGS_V2_EPHEMERAL });
    } else {
      await interaction.reply({ components: [errPanel(text)], flags: FLAGS_V2_EPHEMERAL });
    }
  } catch {}
}

/** Ligne de boutons Confirmer / Annuler. `extra` est réinjecté tel quel dans le customId. */
export function confirmRow(cmd: string, authorId: string, extra = ""): ReturnType<typeof actionRow> {
  const ts = Date.now();
  const suffix = extra ? `:${extra}` : "";
  return actionRow(
    button(`${cmd}:confirm:${authorId}:${ts}${suffix}`, "Confirmer", ButtonStyle.Success, "✅"),
    button(`${cmd}:cancel:${authorId}`, "Annuler", ButtonStyle.Secondary, "❌")
  );
}

export interface ConfirmInfo {
  authorId: string;
  ts: number;
  extra: string[];
}

/** Parse `<cmd>:confirm:<authorId>:<ts>[:extra...]`. */
export function parseConfirm(customId: string, cmd: string): ConfirmInfo | null {
  const parts = customId.split(":");
  if (parts[0] !== cmd || parts[1] !== "confirm") return null;
  const authorId = parts[2];
  const ts = Number(parts[3]);
  if (!authorId || !Number.isFinite(ts)) return null;
  return { authorId, ts, extra: parts.slice(4) };
}

/** Parse `<cmd>:cancel:<authorId>` -> authorId, sinon null. */
export function parseCancel(customId: string, cmd: string): string | null {
  const parts = customId.split(":");
  if (parts[0] === cmd && parts[1] === "cancel" && parts[2]) return parts[2];
  return null;
}

/** Vérifie que le cliqueur est l'auteur de la commande. Répond une erreur sinon. */
export async function checkAuthor(
  interaction: MessageComponentInteraction,
  authorId: string
): Promise<boolean> {
  if (interaction.user.id === authorId) return true;
  await replyErr(interaction, "❌ Vous n'êtes pas l'auteur de cette commande.");
  return false;
}

/** Vérifie que le bouton n'a pas expiré (60 s). */
export async function checkFresh(
  interaction: MessageComponentInteraction,
  ts: number
): Promise<boolean> {
  if (Date.now() - ts <= CONFIRM_TTL) return true;
  try {
    await interaction.update({ components: [] });
  } catch {}
  await replyErr(interaction, "❌ Le délai de confirmation est dépassé (60 s). Relancez la commande.");
  return false;
}

/** Position du rôle le plus haut de l'auteur (-1 si introuvable). */
export async function authorHighestPosition(guild: Guild, userId: string): Promise<number> {
  const m = await guild.members.fetch(userId).catch(() => null);
  return m ? m.roles.highest.position : -1;
}

/** Résout un salon d'option slash vers un vrai salon du cache (les options renvoient un type API partiel). */
export function resolveGuildChannel(
  guild: Guild,
  channelId: string | null | undefined
): GuildBasedChannel | undefined {
  if (!channelId) return undefined;
  return guild.channels.cache.get(channelId);
}

/** Envoie un log de modération dans le salon configuré (silencieux si non configuré). */
export async function logMod(guild: Guild, text: string): Promise<void> {
  try {
    const cfg = getProtectConfig(guild.id);
    const channelId = cfg.logs.moderation;
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ components: [msgPanel(`🛡️ ${text}`, BLURPLE)], flags: FLAGS_V2 });
  } catch {
    // Les logs ne doivent jamais faire échouer une commande.
  }
}
