import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { createRappel, countActiveRappels } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("rappel")
  .setDescription("Programme un rappel (mention dans ce salon, max 30 jours).")
  .addStringOption((o) =>
    o.setName("duree").setDescription("Dans combien de temps : 10m, 2h, 3d… (30 s à 30 jours).").setRequired(true).setMaxLength(12)
  )
  .addStringOption((o) =>
    o.setName("message").setDescription("Le texte du rappel.").setRequired(true).setMaxLength(200)
  );

const MIN_MS = 30_000;
const MAX_MS = 30 * 24 * 3600_000; // 30 jours
const MAX_ACTIFS = 5; // anti-spam : 5 rappels actifs max par utilisateur

/** Parse "10s", "5m", "2h", "3d" (et variantes françaises). */
function parseDuree(raw: string): number | null {
  const m = /^(\d+)\s*(s|sec|seconde?s?|m|min|minute?s?|h|heure?s?|d|jour?s?)$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase()[0];
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3600_000 : 86_400_000;
  const ms = n * mult;
  if (!Number.isSafeInteger(ms)) return null;
  return ms;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel || channel.isDMBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon d'un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const dureeStr = interaction.options.getString("duree", true);
  const message = interaction.options.getString("message", true).trim();
  if (message.length === 0) {
    await interaction.reply({ components: [errPanel("Le message du rappel ne peut pas être vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const ms = parseDuree(dureeStr);
  if (ms === null) {
    await interaction.reply({ components: [errPanel("Durée invalide. Exemples : `30s`, `10m`, `2h`, `3d`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (ms < MIN_MS) {
    await interaction.reply({ components: [errPanel("Durée minimale : 30 secondes.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (ms > MAX_MS) {
    await interaction.reply({ components: [errPanel("Durée maximale : 30 jours.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (countActiveRappels(interaction.user.id) >= MAX_ACTIFS) {
    await interaction.reply({ components: [errPanel(`Tu as déjà ${MAX_ACTIFS} rappels actifs. Attends qu'ils sonnent avant d'en créer d'autres.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const rappel = createRappel({
    guildId: guild.id,
    channelId: channel.id,
    userId: interaction.user.id,
    message,
    remindAt: Date.now() + ms,
  });
  const ts = Math.floor(rappel.remind_at / 1000);
  await interaction.reply({
    components: [okPanel(`⏰ **Rappel programmé !** Je te mentionnerai ici <t:${ts}:R> (<t:${ts}:F>).`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
