import {
  SlashCommandBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  Guild,
  User,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  okPanel,
  errPanel,
  actionRow,
  button,
  ACCENT,
  BLUE,
  RED,
} from "../../../core/ui.ts";
import { logCase, getCases, countCases } from "../func/cases.ts";
import type { ModCase } from "../func/cases.ts";

export const data = new SlashCommandBuilder()
  .setName("cases")
  .setDescription("📁 Dossier de modération : historique des sanctions d'un membre.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

const CMD = "cases";

const TYPE_EMOJI: Record<string, string> = {
  ban: "🔨",
  kick: "👢",
  mute: "🔇",
  warn: "⚠️",
  unban: "✅",
  unmute: "🔈",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function caseLine(c: ModCase): string {
  const emoji = TYPE_EMOJI[c.type] ?? "📌";
  return `**#${c.case_num}** ${emoji} ${c.type.toUpperCase()} — <@${c.moderator_id}>\n> *${c.reason}* · ${fmtDate(c.created_at)}`;
}

function hubContainer() {
  const container = panel(
    [textBlock("## 📁 Dossier de modération\nConsulte l'historique des sanctions d'un membre, ou ajoute un avertissement.\n\nChoisis une action 👇")],
    BLUE
  );
  container.addActionRowComponents(
    actionRow(
      button(`${CMD}:view`, "Voir le dossier", ButtonStyle.Primary, "🔍"),
      button(`${CMD}:warn`, "Avertir un membre", ButtonStyle.Secondary, "⚠️")
    )
  );
  return container;
}

function dossierContainer(target: User, cases: ModCase[], total: number) {
  const lines =
    cases.length > 0
      ? cases.map(caseLine).join("\n\n")
      : "*Aucune sanction enregistrée pour ce membre.*";
  return panel(
    [
      textBlock(
        `## 📁 Dossier de ${target.tag}\n*${total} sanction${total > 1 ? "s" : ""} au total*${total > cases.length ? ` (10 dernières affichées)` : ""}\n\n${lines}`
      ),
    ],
    cases.length > 0 ? RED : ACCENT
  );
}

/** Résout un membre depuis une mention ou un ID Discord. */
async function resolveUser(guild: Guild, input: string): Promise<User | null> {
  const m = input.trim().match(/^<@!?(\d+)>$/) ?? input.trim().match(/^(\d{15,25})$/);
  if (!m) return null;
  try {
    return (await guild.members.fetch(m[1]!)).user;
  } catch {
    return null;
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.isButton()) return;
  const action = interaction.customId.split(":")[1];

  if (action === "view") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:view`).setTitle("Voir le dossier");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Membre")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("membre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder("@pseudo ou ID Discord")
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "warn") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:warn`).setTitle("Avertir un membre");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Membre")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("membre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder("@pseudo ou ID Discord")
        ),
      new LabelBuilder()
        .setLabel("Raison")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("raison").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
        )
    );
    await interaction.showModal(modal);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[1] !== "modal") return;
  const action = parts[2];
  const field = (name: string): string => {
    try {
      return interaction.fields.getTextInputValue(name).trim();
    } catch {
      return "";
    }
  };

  if (action === "view") {
    const target = await resolveUser(guild, field("membre"));
    if (!target) {
      await interaction.reply({ components: [errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const cases = getCases(guild.id, target.id);
    const total = countCases(guild.id, target.id);
    await interaction.reply({ components: [dossierContainer(target, cases, total)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action === "warn") {
    const target = await resolveUser(guild, field("membre"));
    if (!target) {
      await interaction.reply({ components: [errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const raison = field("raison") || "Aucune raison précisée";
    const num = logCase(guild.id, target.id, "warn", raison, interaction.user.id);
    await interaction.reply({
      components: [okPanel(`⚠️ **Avertissement #${num}** enregistré pour ${target}.\n> *${raison}*`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
}
