import {
  SlashCommandBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
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
  BLUE,
  GREEN,
} from "../../../core/ui.ts";
import { listTodos, addTodo, toggleTodo, deleteTodo, clearDoneTodos } from "../func/todo.ts";
import type { Todo } from "../func/todo.ts";

export const data = new SlashCommandBuilder()
  .setName("todo")
  .setDescription("✅ Ta liste de tâches personnelle (sauvegardée).");

const CMD = "todo";
// 6 tâches affichées max : 6×2 boutons = 12 boutons = 3 lignes + 1 ligne
// d'actions = 4 lignes (limite Discord : 5 par message).
const MAX_SHOWN = 6;

function listContainer(userId: string, todos: Todo[]) {
  const shown = todos.slice(0, MAX_SHOWN);
  const done = todos.filter((t) => t.done).length;
  const container = panel(
    [
      textBlock(
        `## ✅ Mes tâches\n*${todos.length} tâche${todos.length > 1 ? "s" : ""} · ${done} terminée${done > 1 ? "s" : ""}*\n\n${
          shown.length > 0
            ? shown.map((t) => `${t.done ? "☑️" : "⬜"} **#${t.id}** — ${t.text}`).join("\n")
            : "*Ta liste est vide. Ajoute ta première tâche !*"
        }${todos.length > MAX_SHOWN ? `\n\n*… et ${todos.length - MAX_SHOWN} autres.*` : ""}`
      ),
    ],
    BLUE
  );
  container.addActionRowComponents(
    actionRow(
      button(`${CMD}:add`, "Ajouter", ButtonStyle.Primary, "➕"),
      button(`${CMD}:clear`, "Effacer terminées", ButtonStyle.Secondary, "🧹")
    )
  );
  // Boutons cocher/supprimer par tâche (max 6 → 3 lignes de boutons)
  for (let i = 0; i < shown.length; i += 5) {
    const row = shown.slice(i, i + 5);
    const btns = row.flatMap((t) => [
      button(`${CMD}:toggle:${t.id}`, `#${t.id} ${t.done ? "↩️" : "✔️"}`, t.done ? ButtonStyle.Secondary : ButtonStyle.Success),
      button(`${CMD}:del:${t.id}`, `🗑️`, ButtonStyle.Danger),
    ]);
    // 5 boutons max par ligne : on regroupe par paquets de 5
    for (let j = 0; j < btns.length; j += 5) {
      container.addActionRowComponents(actionRow(...btns.slice(j, j + 5)));
    }
  }
  return container;
}

async function renderList(interaction: MessageComponentInteraction | ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const todos = listTodos(guild.id, interaction.user.id);
  const container = listContainer(interaction.user.id, todos);
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await interaction.update({ components: [container] });
  } else {
    await interaction.reply({ components: [container], flags: FLAGS_V2_EPHEMERAL });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const todos = listTodos(interaction.guild.id, interaction.user.id);
  await interaction.reply({ components: [listContainer(interaction.user.id, todos)], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.isButton()) return;
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const uid = interaction.user.id;

  if (action === "add") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:add`).setTitle("Nouvelle tâche");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Tâche")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("tache").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setPlaceholder("Ex : réviser les maths")
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "toggle") {
    const todoId = Number(parts[2]);
    if (!Number.isInteger(todoId)) return;
    toggleTodo(guild.id, uid, todoId);
    await renderList(interaction);
    return;
  }

  if (action === "del") {
    const todoId = Number(parts[2]);
    if (!Number.isInteger(todoId)) return;
    deleteTodo(guild.id, uid, todoId);
    await renderList(interaction);
    return;
  }

  if (action === "clear") {
    const n = clearDoneTodos(guild.id, uid);
    const todos = listTodos(guild.id, uid);
    await interaction.update({
      components: [listContainer(uid, todos)],
    });
    if (n > 0) {
      await interaction.followUp({ components: [okPanel(`🧹 ${n} tâche${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} effacée${n > 1 ? "s" : ""}.`)], flags: FLAGS_V2_EPHEMERAL });
    }
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (interaction.customId !== `${CMD}:modal:add`) return;
  let text = "";
  try {
    text = interaction.fields.getTextInputValue("tache").trim();
  } catch {
    /* noop */
  }
  if (!text) {
    await interaction.reply({ components: [errPanel("La tâche est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  addTodo(guild.id, interaction.user.id, text);
  const todos = listTodos(guild.id, interaction.user.id);
  await interaction.reply({ components: [listContainer(interaction.user.id, todos)], flags: FLAGS_V2_EPHEMERAL });
}
