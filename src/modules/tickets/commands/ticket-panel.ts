import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  TextChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  actionRow,
  button,
  errPanel,
  okPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  createPanel,
  deletePanel,
  getPanel,
  listPanels,
  panelSelectOptions,
  panelSupportRoles,
  setLogChannel,
  getLogChannel,
  setPanelMessage,
} from "../func/db.ts";
import {
  LIMITS,
  handlePanelMenu,
  handlePanelOpen,
  isStaff,
  parseSelectOptions,
  resolveCategory,
  resolveRole,
  resolveTextChannel,
} from "../func/tickets.ts";

export const data = new SlashCommandBuilder()
  .setName("ticket-panel")
  .setDescription("Gère les panneaux d'ouverture de tickets.")
  .addSubcommand((s) =>
    s
      .setName("creer")
      .setDescription("Crée un panneau d'ouverture de tickets dans ce salon.")
      .addStringOption((o) =>
        o.setName("titre").setDescription("Titre du panneau.").setRequired(true).setMaxLength(LIMITS.panelTitle)
      )
      .addStringOption((o) =>
        o.setName("description").setDescription("Texte affiché sur le panneau.").setMaxLength(LIMITS.panelDescription)
      )
      .addChannelOption((o) =>
        o.setName("categorie").setDescription("Catégorie où créer les salons tickets.").addChannelTypes(ChannelType.GuildCategory)
      )
      .addRoleOption((o) => o.setName("role-support").setDescription("Rôle de l'équipe support.").setRequired(true))
      .addRoleOption((o) => o.setName("role-support-2").setDescription("Rôle support supplémentaire."))
      .addRoleOption((o) => o.setName("role-support-3").setDescription("Rôle support supplémentaire."))
      .addStringOption((o) =>
        o
          .setName("style")
          .setDescription("Style du panneau.")
          .addChoices({ name: "Bouton unique", value: "button" }, { name: "Menu déroulant", value: "select" })
      )
      .addStringOption((o) =>
        o
          .setName("choix")
          .setDescription("Choix du menu déroulant, séparés par des virgules (ex : Support, Question).")
          .setMaxLength(500)
      )
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Liste les panneaux de tickets du serveur."))
  .addSubcommand((s) =>
    s
      .setName("supprimer")
      .setDescription("Supprime un panneau de tickets.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du panneau.").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s
      .setName("config")
      .setDescription("Configure le salon de logs des transcripts.")
      .addChannelOption((o) =>
        o.setName("salon-logs").setDescription("Salon où envoyer les transcripts.").addChannelTypes(ChannelType.GuildText)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

function needStaff(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember | null): boolean {
  if (!member) return false;
  return isStaff(member, guild.id);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Commande utilisable uniquement sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!needStaff(interaction, guild, member)) {
    await interaction.reply({ components: [errPanel("Réservé à l'équipe support (ou permission Gérer les salons).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();
  switch (sub) {
    case "creer":
      await runCreate(interaction, guild);
      break;
    case "liste":
      await runList(interaction, guild);
      break;
    case "supprimer":
      await runDelete(interaction, guild);
      break;
    case "config":
      await runConfig(interaction, guild);
      break;
    default:
      await interaction.reply({ components: [errPanel("Sous-commande inconnue.")], flags: FLAGS_V2_EPHEMERAL });
  }
}

async function runCreate(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !channel.isSendable()) {
    await interaction.reply({ components: [errPanel("Utilise cette commande dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const title = (interaction.options.getString("titre", true).trim().slice(0, LIMITS.panelTitle));
  const description = (interaction.options.getString("description")?.trim().slice(0, LIMITS.panelDescription)) || "";
  const style = (interaction.options.getString("style") || "button") as "button" | "select";

  // Validation : catégorie et rôles doivent exister.
  const categoryId = await resolveCategory(guild, interaction.options.getChannel("categorie")?.id ?? null);
  if (interaction.options.getChannel("categorie") && !categoryId) {
    await interaction.reply({ components: [errPanel("La catégorie choisie est introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const roleIds: string[] = [];
  for (const opt of ["role-support", "role-support-2", "role-support-3"]) {
    const r = interaction.options.getRole(opt);
    if (r && (await resolveRole(guild, r.id))) roleIds.push(r.id);
  }
  if (roleIds.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun rôle support valide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const selectOptions = style === "select" ? parseSelectOptions(interaction.options.getString("choix")) : [];
  if (style === "select" && selectOptions.length === 0) {
    await interaction.reply({
      components: [errPanel("Le style « menu déroulant » nécessite au moins un choix (`choix` : ex. `Support, Question`).")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  const panelRow = createPanel({
    guildId: guild.id,
    channelId: channel.id,
    title,
    description,
    categoryId,
    supportRoles: roleIds,
    selectOptions,
    style,
    createdBy: interaction.user.id,
  });

  const header = `# 🎫 ${title}\n` + (description ? `> ${description}\n` : "> Clique ci-dessous pour ouvrir un ticket.\n> L'équipe support te répondra dès que possible.");

  let message;
  if (style === "select") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket-panel:menu:${panelRow.id}`)
      .setPlaceholder("Choisis une catégorie de ticket…")
      .addOptions(
        selectOptions.map((label, i) =>
          new StringSelectMenuOptionBuilder().setLabel(label).setValue(String(i)).setEmoji("🎫")
        )
      );
    message = await channel
      .send({
        components: [
          panel([textBlock(header)], BLUE),
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        ],
        flags: FLAGS_V2,
      })
      .catch(() => null);
  } else {
    message = await channel
      .send({
        components: [
          panel([textBlock(header)], BLUE),
          actionRow(button(`ticket-panel:open:${panelRow.id}`, "Créer un ticket", ButtonStyle.Primary, "🎫")),
        ],
        flags: FLAGS_V2,
      })
      .catch(() => null);
  }

  if (!message) {
    deletePanel(panelRow.id);
    await interaction.reply({ components: [errPanel("Impossible de publier le panneau (permissions ?).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setPanelMessage(panelRow.id, message.id);

  await interaction.reply({
    components: [
      okPanel(
        `✅ Panneau **#${panelRow.id}** publié dans <#${channel.id}>.\n` +
          `> **Style :** ${style === "select" ? "menu déroulant" : "bouton"}\n` +
          `> **Rôles support :** ${roleIds.map((r) => `<@&${r}>`).join(", ")}`
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function runList(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const panels = listPanels(guild.id);
  if (panels.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun panneau de tickets sur ce serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = panels.map((p) => {
    const roles = panelSupportRoles(p).map((r) => `<@&${r}>`).join(", ") || "*aucun*";
    const opts = p.style === "select" ? `\n> **Choix :** ${panelSelectOptions(p).join(", ")}` : "";
    return (
      `**#${p.id}** — ${p.title}\n` +
      `> **Salon :** <#${p.channel_id}> • **Style :** ${p.style === "select" ? "menu" : "bouton"}${opts}\n` +
      `> **Support :** ${roles}`
    );
  });
  await interaction.reply({
    components: [panel([textBlock(`# 🎫 Panneaux de tickets (${panels.length})`), sepBlock(), textBlock(lines.join("\n\n"))], BLUE)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function runDelete(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const id = interaction.options.getInteger("id", true);
  const p = getPanel(id);
  if (!p || p.guild_id !== guild.id) {
    await interaction.reply({ components: [errPanel("Panneau introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  // Supprime le message du panneau s'il existe encore.
  if (p.message_id) {
    const ch = (await guild.channels.fetch(p.channel_id).catch(() => null)) as TextChannel | null;
    const msg = ch && ch.isTextBased() ? await ch.messages.fetch(p.message_id).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
  }
  deletePanel(id);
  await interaction.reply({ components: [okPanel(`🗑️ Panneau **#${id}** supprimé.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runConfig(interaction: ChatInputCommandInteraction, guild: Guild): Promise<void> {
  const logs = interaction.options.getChannel("salon-logs");
  if (logs) {
    const valid = await resolveTextChannel(guild, logs.id);
    if (!valid) {
      await interaction.reply({ components: [errPanel("Salon de logs introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setLogChannel(guild.id, valid);
    await interaction.reply({ components: [okPanel(`✅ Les transcripts seront envoyés dans <#${valid}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const current = getLogChannel(guild.id);
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# ⚙️ Configuration tickets\n> **Salon de logs :** ${current ? `<#${current}>` : "*non défini*"}\n> Utilise \`/ticket-panel config salon-logs:#salon\` pour le définir.`)],
        BLUE
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Boutons & menus du panneau (customId préfixés `ticket-panel:`)
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "ticket-panel") return;

  const kind = parts[1];
  const panelId = Number(parts[2]);
  if (!Number.isInteger(panelId)) return;
  try {
    if (kind === "open") {
      await handlePanelOpen(interaction, guild, member, panelId);
    } else if (kind === "menu") {
      if (!interaction.isStringSelectMenu()) return;
      await handlePanelMenu(interaction, guild, member, panelId, interaction.values[0]);
    }
  } catch (err) {
    console.error(`[tickets] erreur composant ${interaction.customId}`, err);
  }
}
