import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("timestamp")
  .setDescription("Convertit une date en timestamp Unix (et inversement).")
  .addStringOption((o) =>
    o.setName("date").setDescription("Date à convertir : JJ/MM/AAAA HH:MM ou format ISO.").setMaxLength(50)
  )
  .addIntegerOption((o) => o.setName("unix").setDescription("Timestamp Unix à convertir en date."));

/** Parse "JJ/MM/AAAA HH:MM" (heure optionnelle) ou laisse Date faire le reste. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s.length > 50) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const dateStr = interaction.options.getString("date");
  const unix = interaction.options.getInteger("unix");

  let ts: number;
  let source: string;
  if (dateStr) {
    const d = parseDate(dateStr);
    if (!d) {
      await interaction.reply({ components: [errPanel("Date invalide. Essaie `25/12/2026 20:00` ou `2026-12-25T20:00`.")], flags: FLAGS_V2 });
      return;
    }
    ts = Math.floor(d.getTime() / 1000);
    source = `\`${dateStr}\``;
  } else if (unix !== null) {
    if (!Number.isSafeInteger(unix) || Math.abs(unix) > 4102444800) {
      await interaction.reply({ components: [errPanel("Timestamp invalide.")], flags: FLAGS_V2 });
      return;
    }
    ts = unix;
    source = `\`${unix}\``;
  } else {
    ts = Math.floor(Date.now() / 1000);
    source = "maintenant";
  }

  await interaction.reply({
    components: [
      panel([
        textBlock(
          `## ⏱️ Conversion (${source})\n` +
            `> **Unix :** \`${ts}\`\n` +
            `> **Date :** <t:${ts}:F>\n` +
            `> **Relatif :** <t:${ts}:R>\n\n` +
            `**Formats Discord à copier :**\n` +
            `\`<t:${ts}:t>\` → <t:${ts}:t> • \`<t:${ts}:D>\` → <t:${ts}:D> • \`<t:${ts}:R>\` → <t:${ts}:R>`
        ),
      ]),
    ],
    flags: FLAGS_V2,
  });
}
