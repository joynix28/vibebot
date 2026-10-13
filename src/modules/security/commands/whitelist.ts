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
import { ensureGuild, parseWhitelist, wlAdd, wlRemove } from "../func/db.ts";

const ROLE_CATS = [
  { value: 0, name: "Roles: All" },
  { value: 15, name: "Roles: Ban" },
  { value: 16, name: "Roles: Kick" },
  { value: 17, name: "Roles: Bot-Add" },
  { value: 18, name: "Roles: Role-Update" },
  { value: 19, name: "Roles: Role-Add" },
  { value: 20, name: "Roles: Channel-Create" },
  { value: 21, name: "Roles: Channel-Delete" },
  { value: 24, name: "Roles: Role-Create" },
  { value: 25, name: "Roles: Role-Delete" },
  { value: 26, name: "Roles: Invite-Link" },
  { value: 31, name: "Roles: Prune" },
];
const USER_CATS = [
  { value: 1, name: "Users: All" },
  { value: 3, name: "Users: Ban" },
  { value: 4, name: "Users: Kick" },
  { value: 5, name: "Users: Bot-Add" },
  { value: 6, name: "Users: Role-Update" },
  { value: 7, name: "Users: Role-Add" },
  { value: 8, name: "Users: Channel-Create" },
  { value: 9, name: "Users: Channel-Delete" },
  { value: 12, name: "Users: Role-Create" },
  { value: 13, name: "Users: Role-Delete" },
  { value: 14, name: "Users: Invite-Link" },
  { value: 32, name: "Users: Prune" },
];
const CHANNEL_CATS = [
  { value: 2, name: "Channels: All" },
  { value: 30, name: "Channels: Invite-Link" },
];

function catsFor(sub: string) {
  if (sub.includes("role")) return ROLE_CATS;
  if (sub.includes("user")) return USER_CATS;
  return CHANNEL_CATS;
}
function typeFor(sub: string): "roles" | "users" | "channels" {
  if (sub.includes("role")) return "roles";
  if (sub.includes("user")) return "users";
  return "channels";
}

export const data = new SlashCommandBuilder()
  .setName("whitelist")
  .setDescription("Gérer la liste blanche de confiance (rôles, salons, membres).");

const CMD = "whitelist";
const BLUE = 0x297fb9;

const HUB_OPTIONS = [
  { label: "Ajouter un rôle", value: "add_role", emoji: "➕", description: "Rôle en liste blanche" },
  { label: "Retirer un rôle", value: "remove_role", emoji: "➖", description: "Rôle hors liste blanche" },
  { label: "Voir les rôles", value: "view_roles", emoji: "📋", description: "Rôles en liste blanche" },
  { label: "Ajouter un salon", value: "add_channel", emoji: "➕", description: "Salon en liste blanche" },
  { label: "Retirer un salon", value: "remove_channel", emoji: "➖", description: "Salon hors liste blanche" },
  { label: "Voir les salons", value: "view_channels", emoji: "📋", description: "Salons en liste blanche" },
  { label: "Ajouter un membre", value: "add_user", emoji: "➕", description: "Membre en liste blanche" },
  { label: "Retirer un membre", value: "remove_user", emoji: "➖", description: "Membre hors liste blanche" },
  { label: "Voir les membres", value: "view_users", emoji: "📋", description: "Membres en liste blanche" },
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
    [textBlock(`# ✅ Liste blanche\nGère les rôles, salons et membres de confiance sur **${guild.name}**.`)],
    BLUE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

/** Extrait un ID depuis une mention ou un ID brut. */
function parseId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? null;
}

/** Résout une catégorie depuis son numéro ou son nom (ex : "15", "ban", "Roles: Ban"). */
function parseCategory(cats: { value: number; name: string }[], raw: string): { value: number; name: string } | null {
  const t = raw.trim().toLowerCase();
  const asNum = parseInt(t, 10);
  if (Number.isFinite(asNum)) {
    return cats.find((c) => c.value === asNum) ?? null;
  }
  return (
    cats.find((c) => c.name.toLowerCase() === t) ??
    cats.find((c) => c.name.toLowerCase().endsWith(`: ${t}`)) ??
    cats.find((c) => c.name.toLowerCase().includes(t)) ??
    null
  );
}

function actionModal(action: string): ModalBuilder {
  const cats = catsFor(action);
  const isView = action.startsWith("view_");
  const targetKind = action.includes("role") ? "Rôle" : action.includes("channel") ? "Salon" : "Membre";
  const titles: Record<string, string> = {
    add_role: "Ajouter un rôle", remove_role: "Retirer un rôle", view_roles: "Voir les rôles",
    add_channel: "Ajouter un salon", remove_channel: "Retirer un salon", view_channels: "Voir les salons",
    add_user: "Ajouter un membre", remove_user: "Retirer un membre", view_users: "Voir les membres",
  };
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:${action}`).setTitle(titles[action] ?? "Liste blanche");
  if (!isView) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("target")
          .setLabel(`${targetKind} (mention ou ID)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(40)
          .setPlaceholder("@nom ou 123456789")
      )
    );
  }
  const catInput = new TextInputBuilder()
    .setCustomId("category")
    .setLabel("Catégorie (numéro ou nom)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(40)
    .setPlaceholder(cats.slice(0, 3).map((c) => `${c.value}=${c.name.split(": ")[1]}`).join(", ") + ", …");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(catInput));
  return modal;
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
    if (HUB_OPTIONS.some((o) => o.value === action)) {
      await interaction.showModal(actionModal(action));
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
  const action = parts[2] ?? "";
  if (!HUB_OPTIONS.some((o) => o.value === action)) return;

  const cats = catsFor(action);
  const type = typeFor(action);
  const cat = parseCategory(cats, interaction.fields.getTextInputValue("category"));
  if (!cat) {
    await interaction.reply({ components: [msgPanel("❌ Catégorie invalide : utilise le numéro ou le nom de la catégorie.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const catName = cat.name;
  const wl = parseWhitelist(ensureGuild(guild.id));
  let msg: string;

  if (action.startsWith("add_") || action.startsWith("remove_")) {
    const id = parseId(interaction.fields.getTextInputValue("target"));
    if (!id) {
      await interaction.reply({ components: [msgPanel("❌ Cible invalide : mentionne-la ou colle son ID.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const mention = action.includes("role") ? `<@&${id}>` : action.includes("channel") ? `<#${id}>` : `<@${id}>`;
    if (action.startsWith("add_")) {
      wlAdd(guild.id, type, id);
      msg = `**${mention}** a été ajouté à la liste blanche (**${catName}**).`;
    } else {
      wlRemove(guild.id, type, id);
      msg = `**${mention}** a été retiré de la liste blanche (**${catName}**).`;
    }
  } else {
    const typeDisplay = catName.split(": ")[0] ?? "Rôles";
    const suffix = catName.split(": ")[1] ?? "Tous";
    const list = wl[type];
    const rendered = list.length
      ? list.map((id) => (type === "roles" ? `<@&${id}>` : type === "channels" ? `<#${id}>` : `<@${id}>`)).join("\n")
      : "Vide";
    msg = `# Liste blanche ${typeDisplay} : ${suffix}\n${rendered}`;
  }

  await interaction.reply({ components: [panel([textBlock(msg)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
}
