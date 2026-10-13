import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, errPanel, actionRow, button } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("compte")
  .setDescription("Compte à rebours jusqu'à une date (avec bouton actualiser).")
  .addStringOption((o) =>
    o.setName("date").setDescription("Date cible : JJ/MM/AAAA HH:MM ou format ISO.").setRequired(true).setMaxLength(50)
  )
  .addStringOption((o) => o.setName("titre").setDescription("Titre du compte à rebours.").setMaxLength(80));

function parseDate(raw: string): Date | null {
  const s = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s.length > 50) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "🎉 **C'est maintenant !**";
  const s = Math.floor(diff / 1000);
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (j > 0) parts.push(`\`${j}\` jour${j > 1 ? "s" : ""}`);
  if (h > 0) parts.push(`\`${h}\` h`);
  if (m > 0) parts.push(`\`${m}\` min`);
  parts.push(`\`${sec}\` s`);
  return parts.join(" ");
}

function render(targetMs: number, title: string) {
  const ts = Math.floor(targetMs / 1000);
  const cont = panel([
    textBlock(`## ⏳ ${title}\n\n${fmtCountdown(targetMs)}\n\n> **Échéance :** <t:${ts}:F> (<t:${ts}:R>)`),
  ]);
  const row = actionRow(button(`compte:actu:${targetMs}`, "Actualiser", ButtonStyle.Primary, "🔄"));
  return { components: [cont, row], flags: FLAGS_V2 } as const;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const dateStr = interaction.options.getString("date", true);
  const title = interaction.options.getString("titre")?.trim().slice(0, 80) || "Compte à rebours";
  const d = parseDate(dateStr);
  if (!d) {
    await interaction.reply({ components: [errPanel("Date invalide. Essaie `25/12/2026 20:00` ou `2026-12-25T20:00`.")], flags: FLAGS_V2 });
    return;
  }
  if (d.getTime() > Date.now() + 10 * 365 * 24 * 3600 * 1000) {
    await interaction.reply({ components: [errPanel("Date trop lointaine (max 10 ans).")], flags: FLAGS_V2 });
    return;
  }
  await interaction.reply(render(d.getTime(), title));
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "compte" || parts[1] !== "actu" || !interaction.isButton()) return;
  const targetMs = Number(parts[2]);
  if (!Number.isFinite(targetMs)) return;
  await interaction.update(render(targetMs, "Compte à rebours"));
}
