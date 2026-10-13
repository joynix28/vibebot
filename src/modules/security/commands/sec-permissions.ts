import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { PERMS, permName } from "../func/perm.ts";
import { addPerm, removePerm, resetPerms, getPerms, usersWithPerm } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("sec-permissions")
  .setDescription("Gérer qui peut utiliser les commandes de modération.");

const CMD = "sec-permissions";
const BLUE = 0x297fb9;

const HUB_OPTIONS = [
  { label: "Voir les permissions d'un membre", value: "view_user", emoji: "👤", description: "Permissions accordées à un membre" },
  { label: "Ajouter une permission", value: "add", emoji: "➕", description: "Accorder une permission" },
  { label: "Retirer une permission", value: "remove", emoji: "➖", description: "Retirer une permission" },
  { label: "Voir par permission", value: "view_permission", emoji: "🔍", description: "Membres ayant une permission" },
  { label: "Réinitialiser un membre", value: "reset", emoji: "🧹", description: "Retirer toutes ses permissions" },
  { label: "Réinitialiser par ID", value: "reset_id", emoji: "🆔", description: "Retirer via l'ID Discord" },
];

function menuRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:menu`)
    .setPlaceholder("Choisis une action…")
    .addOptions(
      HUB_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDescription(o.description)
          .setEmoji(o.emoji)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function hubPayload(guild: Guild) {
  const body = panel(
    [textBlock(`# 🔑 Permissions de modération\nGère qui peut utiliser les commandes de modération sur **${guild.name}**.`)],
    BLUE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Extrait un ID utilisateur depuis une mention ou un ID brut. */
function parseUserId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<@!?(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? null;
}

/** Résout une permission depuis son numéro ou son nom. */
function parsePerm(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  const asNum = parseInt(t, 10);
  if (Number.isFinite(asNum)) {
    const p = PERMS.find((x) => x.value === asNum);
    return p ? p.value : null;
  }
  const p = PERMS.find((x) => x.name.toLowerCase() === t);
  return p ? p.value : null;
}

function permHint(): string {
  return PERMS.map((p) => `${p.value} = ${p.name}`).join(", ");
}

function userField(label = "Utilisateur (mention ou ID)"): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId("user")
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder("@utilisateur ou 123456789");
}

function permField(): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId("permission")
    .setLabel("Permission (numéro ou nom)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder("Ex : 0 ou Ban Command");
}

function showModalFor(interaction: MessageComponentInteraction, action: string): Promise<void> {
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:${action}`);
  const titles: Record<string, string> = {
    view_user: "Permissions d'un membre",
    add: "Ajouter une permission",
    remove: "Retirer une permission",
    view_permission: "Membres par permission",
    reset: "Réinitialiser un membre",
    reset_id: "Réinitialiser par ID",
  };
  modal.setTitle(titles[action] ?? "Permissions");
  if (action === "view_user" || action === "reset") {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userField()));
  } else if (action === "add" || action === "remove") {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(userField()),
      new ActionRowBuilder<TextInputBuilder>().addComponents(permField())
    );
  } else if (action === "view_permission") {
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(permField()));
  } else if (action === "reset_id") {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("user_id")
          .setLabel("ID Discord de l'utilisateur")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(25)
          .setPlaceholder("123456789012345678")
      )
    );
  }
  return interaction.showModal(modal);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("Cette commande ne peut être utilisée que sur un serveur.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (parts[1] === "menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0] ?? "";
    if (["view_user", "add", "remove", "view_permission", "reset", "reset_id"].includes(action)) {
      await showModalFor(interaction, action);
    }
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal") return;
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = parts[2];
  let msg: string;

  const needUser = ["view_user", "add", "remove", "reset"].includes(action ?? "");
  let userId: string | null = null;
  if (needUser) {
    userId = parseUserId(interaction.fields.getTextInputValue("user"));
    if (!userId) {
      await interaction.reply({ components: [msgPanel("❌ Utilisateur invalide : mentionne l'utilisateur ou colle son ID.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
  }

  const needPerm = ["add", "remove", "view_permission"].includes(action ?? "");
  let perm: number | null = null;
  if (needPerm) {
    perm = parsePerm(interaction.fields.getTextInputValue("permission"));
    if (perm === null) {
      await interaction.reply({ components: [msgPanel(`❌ Permission invalide. Valeurs possibles : ${permHint()}.`, BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
  }

  if (action === "view_user") {
    const list = getPerms(guild.id, userId!);
    const user = await interaction.client.users.fetch(userId!).catch(() => null);
    const name = user ? user.username : userId!;
    msg = list.length
      ? `**${name}** a ces permissions :\n${list.map((p) => `- ${permName(p)}`).join("\n")}`
      : `**${name}** n'a aucune permission accordée.`;
  } else if (action === "add") {
    const user = await interaction.client.users.fetch(userId!).catch(() => null);
    addPerm(guild.id, userId!, perm!);
    msg = `La permission **${permName(perm!)}** a été accordée à **${user ? user.username : userId!}**.`;
  } else if (action === "remove") {
    const user = await interaction.client.users.fetch(userId!).catch(() => null);
    removePerm(guild.id, userId!, perm!);
    msg = `La permission **${permName(perm!)}** a été retirée à **${user ? user.username : userId!}**.`;
  } else if (action === "view_permission") {
    const ids = usersWithPerm(guild.id, perm!);
    msg = ids.length
      ? `**${permName(perm!)}** est accordée à :\n${ids.map((id) => `- <@${id}>`).join("\n")}`
      : "Personne n'a cette permission.";
  } else if (action === "reset") {
    const user = await interaction.client.users.fetch(userId!).catch(() => null);
    resetPerms(guild.id, userId!);
    msg = `**${user ? user.username : userId!}** n'a plus aucune permission.`;
  } else if (action === "reset_id") {
    const id = interaction.fields.getTextInputValue("user_id").trim();
    if (!/^\d{15,20}$/.test(id)) {
      await interaction.reply({ components: [msgPanel("❌ ID Discord invalide.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    resetPerms(guild.id, id);
    msg = `**${id}** n'a plus aucune permission.`;
  } else {
    return;
  }

  await interaction.reply({ components: [panel([textBlock(msg)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
}
