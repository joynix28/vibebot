import { ButtonStyle } from "discord.js";
import type { ContainerBuilder } from "discord.js";
import { panel, textBlock, sepBlock, rowBlock, button, footnote } from "../../tempvoice/func/ui.ts";
import { MUSIC_ACCENT, fmtDuration, type Track } from "./player.ts";

/** Ligne d'affichage d'un morceau. */
export function trackLine(t: Track): string {
  return `**[${t.title}](${t.url})** • \`${fmtDuration(t.durationSec)}\` — <@${t.requestedBy.id}>`;
}

/** Boutons de contrôle rapide (pause / suivant / stop / file). */
export function controlRow(paused: boolean) {
  return rowBlock(
    button(
      "musique:pause",
      paused ? "Reprendre" : "Pause",
      paused ? ButtonStyle.Success : ButtonStyle.Secondary,
      paused ? "▶️" : "⏸️"
    ),
    button("musique:skip", "Suivant", ButtonStyle.Secondary, "⏭️"),
    button("musique:stop", "Stop", ButtonStyle.Danger, "⏹️"),
    button("musique:queue", "File", ButtonStyle.Primary, "📋")
  );
}

/** Panel "morceau ajouté / lecture en cours" affiché après /play. */
export function addedPanel(t: Track, playing: boolean, position: number): ContainerBuilder {
  return panel(
    [
      textBlock(playing ? "## ▶️ Lecture en cours" : "## ➕ Ajouté à la file"),
      textBlock(trackLine(t)),
      ...(playing ? [] : [textBlock(`> Position dans la file : **${position}**`)]),
      sepBlock(),
      controlRow(false),
      textBlock(footnote("Ouvre /musique pour le panneau de contrôle complet.")),
    ],
    MUSIC_ACCENT
  );
}
