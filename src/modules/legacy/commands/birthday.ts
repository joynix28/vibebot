import {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  Guild,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  GOLD,
  ACCENT,
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
  .setDescription("Enregistre ton anniversaire pour qu'il soit fêté.");

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

function hubContainer() {
  const container = panel([textBlock("## 🎂 Anniversaires\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("birthday:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Enregistrer mon anniversaire")
        .setValue("set")
        .setDescription("Format JJ/MM, ex : 25/12.")
        .setEmoji("🎂"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Supprimer mon anniversaire")
        .setValue("remove")
        .setDescription("Retire ton anniversaire.")
        .setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir les prochains")
        .setValue("list")
        .setDescription("Affiche les prochains anniversaires.")
        .setEmoji("📅")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "birthday:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];
  const userId = interaction.user.id;

  if (action === "set") {
    const modal = new ModalBuilder().setCustomId("birthday:modal:set").setTitle("Enregistrer mon anniversaire");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Date de naissance")
        .setDescription("Format JJ/MM, ex : 25/12")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("date")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(5)
            .setPlaceholder("25/12")
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "remove") {
    const removed = removeBirthday(guild.id, userId);
    await interaction.update({
      components: [removed ? okPanel("Anniversaire supprimé.") : errPanel("Tu n'as pas d'anniversaire enregistré.")],
      flags: FLAGS_V2,
    });
    return;
  }

  if (action === "list") {
    const birthdays = listBirthdays(guild.id);
    if (birthdays.length === 0) {
      await interaction.update({ components: [errPanel("Aucun anniversaire enregistré.")], flags: FLAGS_V2 });
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
    await interaction.update({ components: [panel([textBlock(`## 🎂 Prochains anniversaires\n${lines}`)], GOLD)], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "birthday:modal:set") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const parsed = parseBirthday(interaction.fields.getTextInputValue("date"));
  if (!parsed) {
    await interaction.reply({ components: [errPanel("Date invalide. Utilise le format JJ/MM, ex : `25/12`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setBirthday(guild.id, interaction.user.id, parsed.month, parsed.day);
  const label = `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}`;
  await interaction.reply({ components: [okPanel(`🎂 Anniversaire enregistré : **${label}**.`)], flags: FLAGS_V2_EPHEMERAL });
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
