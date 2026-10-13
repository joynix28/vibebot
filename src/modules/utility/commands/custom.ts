import {
  SlashCommandBuilder,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  PermissionFlagsBits,
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
} from "../../../core/ui.ts";
import {
  listCustomCommands,
  getCustomCommand,
  normalizeName,
  createCustomCommand,
  deleteCustomCommand,
} from "../func/custom.ts";

export const data = new SlashCommandBuilder()
  .setName("custom")
  .setDescription("⚙️ Commandes personnalisées du serveur.");

const CMD = "custom";

function hasAdmin(member: unknown): boolean {
  if (!member || typeof member !== "object") return false;
  if (!("permissions" in member)) return false;
  const perms = (member as { permissions: unknown }).permissions;
  if (typeof perms === "string") {
    return (BigInt(perms) & PermissionFlagsBits.Administrator) !== 0n;
  }
  if (perms && typeof (perms as { has?: unknown }).has === "function") {
    return (perms as { has: (p: bigint) => boolean }).has(PermissionFlagsBits.Administrator);
  }
  return false;
}

function isAdmin(interaction: MessageComponentInteraction | ModalSubmitInteraction): boolean {
  return hasAdmin(interaction.member);
}

function hubContainer(isAdminView: boolean) {
  const container = panel(
    [textBlock("## ⚙️ Commandes personnalisées\nDes réponses prédéfinies, déclenchées en un clic.\n\nChoisis une action 👇")],
    BLUE
  );
  const buttons = [
    button(`${CMD}:list`, "Liste & déclencher", ButtonStyle.Primary, "▶️"),
  ];
  if (isAdminView) {
    buttons.push(
      button(`${CMD}:create`, "Créer", ButtonStyle.Success, "➕"),
      button(`${CMD}:delete`, "Supprimer", ButtonStyle.Danger, "🗑️")
    );
  }
  container.addActionRowComponents(actionRow(...buttons));
  return container;
}

function listContainer(guildId: string) {
  const cmds = listCustomCommands(guildId);
  const container = panel(
    [
      textBlock(
        `## ▶️ Commandes personnalisées\n\n${
          cmds.length > 0
            ? `*Clique sur un bouton pour envoyer sa réponse dans le salon :*\n\n${cmds.map((c) => `• \`/${c.name}\` — par <@${c.created_by}>`).join("\n")}`
            : "*Aucune commande personnalisée pour le moment.*\nUn administrateur peut en créer via le bouton « Créer »."
        }`
      ),
    ],
    BLUE
  );
  for (let i = 0; i < cmds.length; i += 5) {
    container.addActionRowComponents(
      actionRow(
        ...cmds.slice(i, i + 5).map((c) => button(`${CMD}:run:${c.name}`, `/${c.name}`, ButtonStyle.Secondary))
      )
    );
  }
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member;
  const admin = hasAdmin(member);
  await interaction.reply({ components: [hubContainer(admin)], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  const action = parts[1];

  if (action === "list") {
    await interaction.update({ components: [listContainer(guild.id)] });
    return;
  }

  if (action === "run") {
    const name = parts[2] ?? "";
    const cmd = getCustomCommand(guild.id, name);
    if (!cmd) {
      await interaction.reply({ components: [errPanel("Cette commande personnalisée n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferUpdate();
    const channel = interaction.channel;
    if (channel?.isSendable()) {
      await channel.send({ content: cmd.response }).catch(() => null);
    }
    return;
  }

  // --- Admin uniquement ---
  if (!isAdmin(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action === "create") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:create`).setTitle("Créer une commande");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Nom")
        .setDescription("Lettres, chiffres, - et _ uniquement (max 32).")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("nom").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setPlaceholder("regles")
        ),
      new LabelBuilder()
        .setLabel("Réponse")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("reponse").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1900)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "delete") {
    if (!interaction.isButton()) return;
    const cmds = listCustomCommands(guild.id);
    if (cmds.length === 0) {
      await interaction.reply({ components: [errPanel("Aucune commande personnalisée à supprimer.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${CMD}:del`)
      .setPlaceholder("Choisis la commande à supprimer…")
      .addOptions(
        cmds.slice(0, 25).map((c) =>
          new StringSelectMenuOptionBuilder().setLabel(`/${c.name}`).setValue(c.name).setEmoji("🗑️")
        )
      );
    const container = panel([textBlock("## 🗑️ Supprimer une commande\n*Sélectionne la commande à supprimer définitivement.*")], BLUE);
    container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
    await interaction.update({ components: [container] });
    return;
  }

  if (action === "del") {
    if (!interaction.isStringSelectMenu()) return;
    const name = interaction.values[0] ?? "";
    const ok = deleteCustomCommand(guild.id, name);
    await interaction.update({
      components: [ok ? okPanel(`🗑️ Commande \`/${name}\` supprimée.`) : errPanel("Commande introuvable.")],
    });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (interaction.customId !== `${CMD}:modal:create`) return;
  if (!isAdmin(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const field = (name: string): string => {
    try {
      return interaction.fields.getTextInputValue(name).trim();
    } catch {
      return "";
    }
  };
  const name = normalizeName(field("nom"));
  if (!name) {
    await interaction.reply({ components: [errPanel("Nom invalide : lettres, chiffres, `-` et `_` uniquement (max 32 caractères).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (interaction.client.commands.has(name)) {
    await interaction.reply({ components: [errPanel(`\`/${name}\` est déjà une commande du bot. Choisis un autre nom.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const reponse = field("reponse");
  if (!reponse) {
    await interaction.reply({ components: [errPanel("La réponse est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const ok = createCustomCommand(guild.id, name, reponse, interaction.user.id);
  await interaction.reply({
    components: [ok ? okPanel(`✅ Commande \`/${name}\` créée ! Déclenche-la depuis le bouton « Liste & déclencher ».`) : errPanel(`Une commande \`/${name}\` existe déjà.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
