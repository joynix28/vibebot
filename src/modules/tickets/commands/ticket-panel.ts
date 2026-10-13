import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  TextChannel,
} from "discord.js";
import { randomUUID } from "node:crypto";
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
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

/** Actions proposées par le hub. */
const ACTIONS = [
  { value: "creer", label: "Créer un panneau", emoji: "➕", desc: "Publie un panneau d'ouverture." },
  { value: "liste", label: "Lister les panneaux", emoji: "📋", desc: "Affiche les panneaux du serveur." },
  { value: "supprimer", label: "Supprimer un panneau", emoji: "🗑️", desc: "Supprime un panneau existant." },
  { value: "config", label: "Configuration", emoji: "⚙️", desc: "Salon de logs des transcripts." },
] as const;

/** Créations en attente du 2e formulaire (style "menu" → choix). */
const pendingCreations = new Map<
  string,
  {
    guildId: string;
    channelId: string;
    title: string;
    description: string;
    roleIds: string[];
    categoryId: string | null;
    createdBy: string;
    expires: number;
  }
>();

function sweepPending(): void {
  const now = Date.now();
  for (const [k, v] of pendingCreations) {
    if (v.expires < now) pendingCreations.delete(k);
  }
}

/** Panneau du hub : titre + menu d'actions. */
function hubPanel(): import("discord.js").ContainerBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket-panel:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      ACTIONS.map((a) =>
        new StringSelectMenuOptionBuilder().setLabel(a.label).setValue(a.value).setDescription(a.desc).setEmoji(a.emoji)
      )
    );
  const c = panel([textBlock("# 🎫 Panneaux de tickets\n> Choisis une action ci-dessous.")], BLUE);
  c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return c;
}

function needStaff(member: GuildMember | null, guild: Guild): boolean {
  if (!member) return false;
  return isStaff(member, guild.id);
}

async function denyStaff(interaction: MessageComponentInteraction | ModalSubmitInteraction): Promise<void> {
  await interaction
    .reply({ components: [errPanel("Réservé à l'équipe support (ou permission Gérer les salons).")], flags: FLAGS_V2_EPHEMERAL })
    .catch(() => {});
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Commande utilisable uniquement sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!needStaff(member, guild)) {
    await interaction.reply({ components: [errPanel("Réservé à l'équipe support (ou permission Gérer les salons).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Création d'un panneau
// ---------------------------------------------------------------------------

interface PanelDraft {
  title: string;
  description: string;
  categoryId: string | null;
  roleIds: string[];
  selectOptions: string[];
  style: "button" | "select";
}

/** Ouvre le formulaire de création (5 champs max par modal). */
async function openCreateModal(interaction: MessageComponentInteraction): Promise<void> {
  const modal = new ModalBuilder().setCustomId("ticket-panel:modal:creer").setTitle("Créer un panneau de tickets");
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Titre du panneau")
      .setTextInputComponent(
        new TextInputBuilder().setCustomId("titre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(LIMITS.panelTitle)
      ),
    new LabelBuilder()
      .setLabel("Description")
      .setDescription("Texte affiché sur le panneau.")
      .setTextInputComponent(
        new TextInputBuilder().setCustomId("description").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(LIMITS.panelDescription)
      ),
    new LabelBuilder()
      .setLabel("Rôles support")
      .setDescription("Jusqu'à 3 rôles de l'équipe support.")
      .setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId("roles").setMinValues(1).setMaxValues(3)),
    new LabelBuilder()
      .setLabel("Catégorie des tickets")
      .setDescription("Où créer les salons tickets (optionnel).")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder().setCustomId("categorie").setChannelTypes(ChannelType.GuildCategory).setMaxValues(1)
      ),
    new LabelBuilder()
      .setLabel("Style du panneau")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("style")
          .setPlaceholder("Choisis un style…")
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Bouton unique").setValue("button").setEmoji("🔘"),
            new StringSelectMenuOptionBuilder().setLabel("Menu déroulant").setValue("select").setEmoji("📋")
          )
      )
  );
  await interaction.showModal(modal).catch(() => {});
}

/** Publie le panneau dans le salon et retourne son résumé. */
async function createAndPublishPanel(
  guild: Guild,
  channel: TextChannel,
  draft: PanelDraft,
  createdBy: string
): Promise<{ ok: boolean; message: string }> {
  const panelRow = createPanel({
    guildId: guild.id,
    channelId: channel.id,
    title: draft.title,
    description: draft.description,
    categoryId: draft.categoryId,
    supportRoles: draft.roleIds,
    selectOptions: draft.selectOptions,
    style: draft.style,
    createdBy,
  });

  const header = `# 🎫 ${draft.title}\n` + (draft.description ? `> ${draft.description}\n` : "> Clique ci-dessous pour ouvrir un ticket.\n> L'équipe support te répondra dès que possible.");

  let message;
  if (draft.style === "select") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`ticket-panel:menu:${panelRow.id}`)
      .setPlaceholder("Choisis une catégorie de ticket…")
      .addOptions(
        draft.selectOptions.map((label, i) =>
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
    return { ok: false, message: "Impossible de publier le panneau (permissions ?)." };
  }
  setPanelMessage(panelRow.id, message.id);
  return {
    ok: true,
    message:
      `✅ Panneau **#${panelRow.id}** publié dans <#${channel.id}>.\n` +
      `> **Style :** ${draft.style === "select" ? "menu déroulant" : "bouton"}\n` +
      `> **Rôles support :** ${draft.roleIds.map((r) => `<@&${r}>`).join(", ")}`,
  };
}

async function actionList(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
  const panels = listPanels(guild.id);
  if (panels.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun panneau de tickets sur ce serveur.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
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
  }).catch(() => {});
}

/** Affiche le sélecteur de panneau à supprimer. */
async function actionDeletePicker(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
  const panels = listPanels(guild.id);
  if (panels.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun panneau de tickets sur ce serveur.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket-panel:delpick")
    .setPlaceholder("Choisis le panneau à supprimer…")
    .addOptions(
      panels.slice(0, 25).map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`#${p.id} — ${p.title.slice(0, 80)}`)
          .setValue(String(p.id))
          .setDescription(`Salon : #${p.channel_id.slice(0, 20)}…`)
          .setEmoji("🗑️")
      )
    );
  const c = panel([textBlock("# 🗑️ Supprimer un panneau\n> Choisis le panneau à supprimer définitivement.")], BLUE);
  c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  await interaction.reply({ components: [c], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

async function applyDelete(interaction: MessageComponentInteraction, guild: Guild, id: number): Promise<void> {
  const p = getPanel(id);
  if (!p || p.guild_id !== guild.id) {
    await interaction.reply({ components: [errPanel("Panneau introuvable.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  if (p.message_id) {
    const ch = (await guild.channels.fetch(p.channel_id).catch(() => null)) as TextChannel | null;
    const msg = ch && ch.isTextBased() ? await ch.messages.fetch(p.message_id).catch(() => null) : null;
    if (msg) await msg.delete().catch(() => {});
  }
  deletePanel(id);
  await interaction.reply({ components: [okPanel(`🗑️ Panneau **#${id}** supprimé.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

/** Affiche la configuration (salon de logs) avec sélecteur. */
async function actionConfig(interaction: MessageComponentInteraction, guild: Guild): Promise<void> {
  const current = getLogChannel(guild.id);
  const picker = new ChannelSelectMenuBuilder()
    .setCustomId("ticket-panel:logpick")
    .setPlaceholder("Choisis le salon des transcripts…")
    .setChannelTypes(ChannelType.GuildText)
    .setMaxValues(1);
  const c = panel(
    [textBlock(`# ⚙️ Configuration tickets\n> **Salon de logs :** ${current ? `<#${current}>` : "*non défini*"}\n> Choisis un salon ci-dessous pour y envoyer les transcripts.`)],
    BLUE
  );
  c.addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(picker));
  c.addActionRowComponents(actionRow(button("ticket-panel:logclear", "Retirer le salon de logs", ButtonStyle.Secondary, "🗑️")));
  await interaction.reply({ components: [c], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Boutons & menus (customId préfixés `ticket-panel:`)
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "ticket-panel") return;

  const kind = parts[1];

  // Panneaux publics (accessibles à tous) — conservés tels quels.
  if (kind === "open" || kind === "menu") {
    const panelId = Number(parts[2]);
    if (!Number.isInteger(panelId)) return;
    try {
      if (kind === "open") {
        await handlePanelOpen(interaction, guild, member, panelId);
      } else if (interaction.isStringSelectMenu()) {
        await handlePanelMenu(interaction, guild, member, panelId, interaction.values[0]);
      }
    } catch (err) {
      console.error(`[tickets] erreur composant ${interaction.customId}`, err);
    }
    return;
  }

  // Hub d'administration — réservé au staff.
  if (!needStaff(member, guild)) {
    await denyStaff(interaction);
    return;
  }

  try {
    switch (kind) {
      case "menu": {
        if (!interaction.isStringSelectMenu()) return;
        const action = interaction.values[0];
        if (action === "creer") await openCreateModal(interaction);
        else if (action === "liste") await actionList(interaction, guild);
        else if (action === "supprimer") await actionDeletePicker(interaction, guild);
        else if (action === "config") await actionConfig(interaction, guild);
        break;
      }
      case "choixbtn": {
        // Ouvre le 2e formulaire (choix du menu) — impossible depuis un submit de modal,
        // d'où ce passage par un bouton.
        const token = parts[2] ?? "";
        const modal = new ModalBuilder().setCustomId(`ticket-panel:modal:choix:${token}`).setTitle("Choix du menu déroulant");
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel("Choix du menu")
            .setDescription("Séparés par des virgules. Ex : Support, Question, Partenariat.")
            .setTextInputComponent(
              new TextInputBuilder().setCustomId("choix").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
            )
        );
        await interaction.showModal(modal).catch(() => {});
        break;
      }
      case "delpick": {
        if (!interaction.isStringSelectMenu()) return;
        const id = Number(interaction.values[0]);
        if (!Number.isInteger(id)) return;
        await applyDelete(interaction, guild, id);
        break;
      }
      case "logpick": {
        if (!interaction.isChannelSelectMenu()) return;
        const channelId = interaction.values[0];
        if (!channelId) return;
        const valid = await resolveTextChannel(guild, channelId);
        if (!valid) {
          await interaction.reply({ components: [errPanel("Salon de logs introuvable.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
          return;
        }
        setLogChannel(guild.id, valid);
        await interaction.reply({ components: [okPanel(`✅ Les transcripts seront envoyés dans <#${valid}>.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
        break;
      }
      case "logclear": {
        setLogChannel(guild.id, null);
        await interaction.reply({ components: [okPanel("🗑️ Salon de logs retiré.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
        break;
      }
    }
  } catch (err) {
    console.error(`[tickets] erreur composant ${interaction.customId}`, err);
  }
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "ticket-panel") return;
  if (parts[1] !== "modal") return;
  if (!needStaff(member, guild)) {
    await denyStaff(interaction);
    return;
  }

  const form = parts[2];
  try {
    if (form === "creer") {
      await handleCreateModal(interaction, guild, member);
    } else if (form === "choix") {
      await handleChoixModal(interaction, guild, member, parts[3] ?? "");
    }
  } catch (err) {
    console.error(`[tickets] erreur modal ${interaction.customId}`, err);
  }
}

/** 1er formulaire : titre, description, rôles, catégorie, style. */
async function handleCreateModal(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  member: GuildMember
): Promise<void> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || !channel.isSendable() || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ components: [errPanel("Utilise cette commande dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  const title = interaction.fields.getTextInputValue("titre").trim().slice(0, LIMITS.panelTitle);
  if (!title) {
    await interaction.reply({ components: [errPanel("Le titre est requis.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  const description = interaction.fields.getTextInputValue("description")?.trim().slice(0, LIMITS.panelDescription) ?? "";
  const style = interaction.fields.getStringSelectValues("style")[0] as "button" | "select" | undefined;
  if (style !== "button" && style !== "select") {
    await interaction.reply({ components: [errPanel("Choisis un style de panneau.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  const roleIds: string[] = [];
  const selectedRoles = interaction.fields.getSelectedRoles("roles");
  if (selectedRoles) {
    for (const r of selectedRoles.values()) {
      if (r && (await resolveRole(guild, r.id))) roleIds.push(r.id);
      if (roleIds.length >= 3) break;
    }
  }
  if (roleIds.length === 0) {
    await interaction.reply({ components: [errPanel("Choisis au moins un rôle support valide.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  const catValues = interaction.fields.getSelectedChannels("categorie");
  const catId = catValues?.firstKey() ?? null;
  let categoryId: string | null = null;
  if (catId) {
    categoryId = await resolveCategory(guild, catId);
    if (!categoryId) {
      await interaction.reply({ components: [errPanel("La catégorie choisie est introuvable.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      return;
    }
  }

  // Style "menu" : 2e formulaire pour les choix.
  if (style === "select") {
    sweepPending();
    const token = randomUUID();
    pendingCreations.set(token, {
      guildId: guild.id,
      channelId: channel.id,
      title,
      description,
      roleIds,
      categoryId,
      createdBy: member.id,
      expires: Date.now() + 5 * 60 * 1000,
    });
    // Style "menu" : on ne peut pas ouvrir un 2e modal depuis un submit de modal.
    // On renvoie un bouton qui ouvrira le formulaire des choix.
    await interaction
      .reply({
        components: [
          panel(
            [
              textBlock(`# 🛠️ Panneau en cours\n**${title}** — style menu déroulant.\nClique ci-dessous pour définir les choix du menu.`),
            ],
            BLUE
          ),
          actionRow(button(`ticket-panel:choixbtn:${token}`, "Définir les choix", ButtonStyle.Primary, "📝")),
        ],
        flags: FLAGS_V2_EPHEMERAL,
      })
      .catch(() => {});
    return;
  }

  const res = await createAndPublishPanel(
    guild,
    channel,
    {
      title,
      description,
      categoryId,
      roleIds,
      selectOptions: [],
      style: "button",
    },
    member.id
  );
  await interaction
    .reply({ components: [res.ok ? okPanel(res.message) : errPanel(res.message)], flags: FLAGS_V2_EPHEMERAL })
    .catch(() => {});
}

/** 2e formulaire : choix du menu déroulant, puis publication. */
async function handleChoixModal(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  member: GuildMember,
  token: string
): Promise<void> {
  sweepPending();
  const pending = pendingCreations.get(token);
  if (!pending || pending.guildId !== guild.id) {
    await interaction.reply({ components: [errPanel("Création expirée, recommence.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  pendingCreations.delete(token);

  const selectOptions = parseSelectOptions(interaction.fields.getTextInputValue("choix"));
  if (selectOptions.length === 0) {
    await interaction.reply({ components: [errPanel("Indique au moins un choix (ex : `Support, Question`).")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  const channel = await guild.channels.fetch(pending.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText || !channel.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon d'origine introuvable.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  const res = await createAndPublishPanel(
    guild,
    channel,
    {
      title: pending.title,
      description: pending.description,
      categoryId: pending.categoryId,
      roleIds: pending.roleIds,
      selectOptions,
      style: "select",
    },
    member.id
  );
  await interaction
    .reply({ components: [res.ok ? okPanel(res.message) : errPanel(res.message)], flags: FLAGS_V2_EPHEMERAL })
    .catch(() => {});
}
