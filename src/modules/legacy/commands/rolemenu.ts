import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonStyle,
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
  GuildMember,
  TextBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  ACCENT,
  okPanel,
  errPanel,
  panel,
  textBlock,
  actionRow,
  button,
  fieldRaw,
} from "../../../core/ui.ts";
import { createRolemenu, getRolemenu, setRolemenuMessage, deleteRolemenu, listRolemenus } from "../func/db-gestion.ts";

const MAX_ROLES = 20;

export const data = new SlashCommandBuilder()
  .setName("rolemenu")
  .setDescription("Crée des menus de rôles à boutons.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function buildMenuComponents(menuId: number, label: string, roles: { id: string; name: string }[]): ReturnType<typeof actionRow>[] {
  const rows: ReturnType<typeof actionRow>[] = [];
  let current: ReturnType<typeof button>[] = [];
  for (const role of roles) {
    current.push(button(`rolemenu:toggle:${menuId}:${role.id}`, role.name.slice(0, 80), ButtonStyle.Secondary));
    if (current.length === 5) {
      rows.push(actionRow(...(current.splice(0) as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
    }
  }
  if (current.length > 0) {
    rows.push(actionRow(...(current as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
  }
  return rows;
}

function hubContainer() {
  const container = panel([textBlock("## 🎭 Menus de rôles\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("rolemenu:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Créer un menu")
        .setValue("create")
        .setDescription("Publie un menu de rôles à boutons.")
        .setEmoji("➕"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Supprimer un menu")
        .setValue("delete")
        .setDescription("Supprime un menu de rôles existant.")
        .setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lister les menus")
        .setValue("list")
        .setDescription("Affiche les menus du serveur.")
        .setEmoji("📋")
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
  // Boutons des menus publiés : rolemenu:toggle:<menuId>:<roleId> (logique d'origine conservée).
  if (interaction.customId.startsWith("rolemenu:toggle:")) {
    await handleToggle(interaction);
    return;
  }
  if (!interaction.isStringSelectMenu() || interaction.customId !== "rolemenu:menu") return;
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "create") {
    const modal = new ModalBuilder().setCustomId("rolemenu:modal:create").setTitle("Créer un menu de rôles");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Titre du menu")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("label").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
        ),
      new LabelBuilder()
        .setLabel("Rôles")
        .setDescription("Mentions ou IDs séparés par des espaces (max 20).")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("roles").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "delete") {
    const modal = new ModalBuilder().setCustomId("rolemenu:modal:delete").setTitle("Supprimer un menu");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("ID du menu")
        .setDescription("L'ID affiché dans la liste des menus.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("id").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "list") {
    const menus = listRolemenus(guild.id);
    if (menus.length === 0) {
      await interaction.update({ components: [errPanel("Aucun menu de rôles.")], flags: FLAGS_V2 });
      return;
    }
    const lines = menus.map((m) => `\`${m.id}\` — **${m.label}** — ${m.roles.length} rôle(s) — <#${m.channel_id}>`).join("\n");
    await interaction.update({ components: [panel([textBlock(`## 🎭 Menus de rôles\n${lines}`)], BLUE)], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === "rolemenu:modal:create") {
    const label = interaction.fields.getTextInputValue("label").trim();
    const rawRoles = interaction.fields.getTextInputValue("roles");
    const ids = [...new Set(rawRoles.match(/\d{17,20}/g) ?? [])].slice(0, MAX_ROLES);
    if (ids.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun rôle valide trouvé. Mentionne des rôles ou colle leurs IDs.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const roles: { id: string; name: string }[] = [];
    for (const id of ids) {
      const role = await guild.roles.fetch(id).catch(() => null);
      if (!role || role.managed) continue;
      roles.push({ id: role.id, name: role.name });
    }
    if (roles.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun de ces rôles n'est attribuable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const menuId = createRolemenu(guild.id, channel.id, label, roles.map((r) => r.id));
    const postChannel = channel as TextBasedChannel;
    if (!postChannel.isSendable()) {
      deleteRolemenu(guild.id, menuId);
      await interaction.reply({ components: [errPanel("Impossible de publier le menu.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const sent = await postChannel
      .send({
        components: [panel([textBlock(`## 🎭 ${label}\n*Clique sur un bouton pour obtenir ou retirer le rôle.*`)], BLUE), ...buildMenuComponents(menuId, label, roles)],
        flags: FLAGS_V2,
      })
      .catch(() => null);
    if (!sent) {
      deleteRolemenu(guild.id, menuId);
      await interaction.reply({ components: [errPanel("Impossible de publier le menu.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setRolemenuMessage(menuId, sent.id);
    await interaction.reply({
      components: [okPanel(`## ✅ Menu de rôles créé\n${fieldRaw("ID", String(menuId))}\n${fieldRaw("Rôles", roles.map((r) => `<@&${r.id}>`).join(" ") || "—")}`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (interaction.customId === "rolemenu:modal:delete") {
    const id = Number(interaction.fields.getTextInputValue("id"));
    if (!Number.isInteger(id) || id < 1) {
      await interaction.reply({ components: [errPanel("ID invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const menu = getRolemenu(id);
    if (!menu || menu.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel(`Aucun menu avec l'ID \`${id}\`.` )], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (menu.message_id) {
      const ch = (await guild.channels.fetch(menu.channel_id).catch(() => null)) as TextBasedChannel | null;
      if (ch?.isTextBased()) await ch.messages.delete(menu.message_id).catch(() => {});
    }
    deleteRolemenu(guild.id, id);
    await interaction.reply({ components: [okPanel(`Menu de rôles \`${id}\` supprimé.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
}

/** Boutons « obtenir/retirer le rôle » des menus publiés (logique d'origine). */
async function handleToggle(interaction: MessageComponentInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const menuId = Number(parts[2]);
  const roleId = parts[3];
  if (!Number.isInteger(menuId) || !roleId) return;
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) return;
  const menu = getRolemenu(menuId);
  if (!menu || menu.guild_id !== guild.id || !menu.roles.includes(roleId)) {
    await interaction.reply({ components: [errPanel("Ce menu n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await interaction.reply({ components: [errPanel("Ce rôle n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ components: [okPanel(`Rôle **${role.name}** retiré.`)], flags: FLAGS_V2_EPHEMERAL });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ components: [panel([textBlock(`## ✅ Rôle obtenu\nTu as maintenant le rôle **${role.name}**.`)], GREEN)], flags: FLAGS_V2_EPHEMERAL });
    }
  } catch {
    await interaction.reply({ components: [errPanel("Impossible de modifier tes rôles (hiérarchie ou permissions).")], flags: FLAGS_V2_EPHEMERAL });
  }
}
