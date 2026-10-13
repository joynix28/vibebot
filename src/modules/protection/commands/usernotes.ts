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
} from "../../../core/ui.ts";
import { addNote, getNotes, deleteNote } from "../func/cases.ts";
import type { UserNote } from "../func/cases.ts";

export const data = new SlashCommandBuilder()
  .setName("usernotes")
  .setDescription("📝 Notes privées du staff sur les membres.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

const CMD = "usernotes";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function hubContainer() {
  const container = panel(
    [textBlock("## 📝 Notes du staff\nDes notes privées sur les membres, visibles uniquement par la modération.\n\nChoisis une action 👇")],
    BLUE
  );
  container.addActionRowComponents(
    actionRow(
      button(`${CMD}:add`, "Ajouter une note", ButtonStyle.Primary, "➕"),
      button(`${CMD}:list`, "Voir les notes", ButtonStyle.Secondary, "🔍")
    )
  );
  return container;
}

function notesContainer(target: User, notes: UserNote[]) {
  const container = panel(
    [
      textBlock(
        `## 📝 Notes sur ${target.tag}\n\n${
          notes.length > 0
            ? notes.map((n) => `**#${n.id}** — <@${n.author_id}> · ${fmtDate(n.created_at)}\n> ${n.note}`).join("\n\n")
            : "*Aucune note pour ce membre.*"
        }`
      ),
    ],
    ACCENT
  );
  // Un bouton de suppression par note (max 10 affichées, 2 lignes de 5)
  for (let i = 0; i < notes.length; i += 5) {
    container.addActionRowComponents(
      actionRow(
        ...notes.slice(i, i + 5).map((n) => button(`${CMD}:del:${n.id}:${target.id}`, `#${n.id}`, ButtonStyle.Danger, "🗑️"))
      )
    );
  }
  return container;
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
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "add") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:add`).setTitle("Ajouter une note");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Membre")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("membre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder("@pseudo ou ID Discord")
        ),
      new LabelBuilder()
        .setLabel("Note")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("note").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "list") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:list`).setTitle("Voir les notes");
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

  if (action === "del") {
    const noteId = Number(parts[2]);
    const targetId = parts[3] ?? "";
    if (!Number.isInteger(noteId)) return;
    const ok = deleteNote(guild.id, noteId);
    if (!ok) {
      await interaction.reply({ components: [errPanel("Note introuvable (déjà supprimée ?).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const target = await guild.members.fetch(targetId).then((m) => m.user).catch(() => null);
    if (!target) {
      await interaction.update({ components: [okPanel(`🗑️ Note **#${noteId}** supprimée.`)] });
      return;
    }
    const notes = getNotes(guild.id, target.id);
    await interaction.update({ components: [notesContainer(target, notes)] });
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

  const target = await resolveUser(guild, field("membre"));
  if (!target) {
    await interaction.reply({ components: [errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action === "add") {
    const note = field("note");
    if (!note) {
      await interaction.reply({ components: [errPanel("La note est vide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const id = addNote(guild.id, target.id, note, interaction.user.id);
    await interaction.reply({
      components: [okPanel(`📝 Note **#${id}** ajoutée sur ${target}.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (action === "list") {
    const notes = getNotes(guild.id, target.id);
    await interaction.reply({ components: [notesContainer(target, notes)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
}
