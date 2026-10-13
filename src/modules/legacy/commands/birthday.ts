import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { setBirthday, removeBirthday, getBirthday, listBirthdays, markBirthdayAnnounced, listGuildsWithBirthdays } from "../func/db-gestion.ts";
import { getWelcome } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("birthday")
  .setDescription("Enregistre ton anniversaire pour qu'il soit fêté.")
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Enregistre ton anniversaire.")
      .addStringOption((o) => o.setName("date").setDescription("Ta date au format JJ/MM (ex : 25/12).").setRequired(true).setMaxLength(5))
  )
  .addSubcommand((s) => s.setName("remove").setDescription("Supprime ton anniversaire."))
  .addSubcommand((s) => s.setName("list").setDescription("Affiche les prochains anniversaires."));

/** Valide « JJ/MM » et retourne { day, month } ou null. */
export function parseBirthday(input: string): { day: number; month: number } | null {
  const m = String(input).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(2000, month - 1, day);
  if (probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return { day, month };
}

/** Nombre de jours avant la prochaine occurrence (0 = aujourd'hui). */
export function daysUntil(month: number, day: number, now = new Date()): number {
  const thisYear = new Date(now.getFullYear(), month - 1, day);
  const next = thisYear.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    ? thisYear
    : new Date(now.getFullYear() + 1, month - 1, day);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === "set") {
    const parsed = parseBirthday(interaction.options.getString("date", true));
    if (!parsed) {
      await interaction.reply({ components: [errPanel("Date invalide. Utilise le format JJ/MM, ex : `25/12`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setBirthday(guild.id, userId, parsed.month, parsed.day);
    const label = `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}`;
    await interaction.reply({ components: [okPanel(`🎂 Anniversaire enregistré : **${label}**.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (sub === "remove") {
    const removed = removeBirthday(guild.id, userId);
    await interaction.reply({
      components: [removed ? okPanel("Anniversaire supprimé.") : errPanel("Tu n'as pas d'anniversaire enregistré.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  // list : prochains anniversaires
  const birthdays = listBirthdays(guild.id);
  if (birthdays.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun anniversaire enregistré. Utilise `/birthday set`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const upcoming = birthdays
    .map((b) => ({ ...b, in: daysUntil(b.month, b.day) }))
    .sort((a, b) => a.in - b.in)
    .slice(0, 15);
  const lines = upcoming
    .map((b) => {
      const label = `${String(b.day).padStart(2, "0")}/${String(b.month).padStart(2, "0")}`;
      const when = b.in === 0 ? "🎉 **aujourd'hui**" : `dans ${b.in} jour(s)`;
      return `<@${b.user_id}> — ${label} (${when})`;
    })
    .join("\n");
  await interaction.reply({ components: [panel([textBlock(`## 🎂 Prochains anniversaires\n${lines}`)], GOLD)], flags: FLAGS_V2_EPHEMERAL });
}

/** Annonce les anniversaires du jour (utilisé par le scheduler). */
export async function announceTodaysBirthdays(guild: Guild, now = new Date()): Promise<void> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const todays = listBirthdays(guild.id).filter((b) => b.month === month && b.day === day && b.announced_year < year);
  if (todays.length === 0) return;

  // Salon d'annonce : salon welcome configuré, sinon salon système.
  const welcome = getWelcome(guild.id);
  const channelId = welcome?.channelId ?? guild.systemChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const mentions = todays.map((b) => `<@${b.user_id}>`).join(" ");
  await channel
    .send({
      components: [
        panel(
          [
            textBlock(`## 🎂 Joyeux anniversaire !\n${mentions}`),
            textBlock(`${fieldRaw("Date", `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`)}\n*Souhaitez-leur une belle journée ! 🎉*`),
          ],
          GOLD
        ),
      ],
      flags: FLAGS_V2,
    })
    .catch(() => {});
  for (const b of todays) markBirthdayAnnounced(guild.id, b.user_id, year);
}

// Ré-export pour le scheduler (évite d'importer tout le module de commande).
export { listGuildsWithBirthdays, getBirthday };
