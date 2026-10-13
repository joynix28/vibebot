import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  FileBuilder,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  TextChannel,
  User,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  GOLD,
  actionRow,
  button,
  errPanel,
  msgPanel,
  okPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  getFeedback,
  getOpenTicketByUser,
  getStaffStats,
  getTicket,
  getTicketStats,
  listPanels,
  releaseTicket as dbReleaseTicket,
  saveFeedback,
  claimTicket as dbClaimTicket,
  setTicketPriority,
  setTicketTopic,
  transferTicket as dbTransferTicket,
  type Ticket,
} from "../func/db.ts";
import {
  buildTranscript,
  canManageTicket,
  checkTicket,
  createTicketChannel,
  finalizeClose,
  formatDuration,
  isStaff,
  LIMITS,
  priorityLabel,
  sanitizeChannelName,
  scheduleChannelDelete,
  sendTranscriptToLog,
  stars,
  ticketOfChannel,
} from "../func/tickets.ts";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Gère les tickets du serveur : ouvrir, fermer, claim…");

/** Actions proposées par le hub (une option par ancienne sous-commande). */
const ACTIONS = [
  { value: "new", label: "Ouvrir un ticket", emoji: "🎫", desc: "Crée un nouveau ticket." },
  { value: "close", label: "Fermer le ticket", emoji: "🔒", desc: "Ferme le ticket actuel." },
  { value: "claim", label: "Prendre en charge", emoji: "🙋", desc: "Prends en charge le ticket. (staff)" },
  { value: "release", label: "Libérer le ticket", emoji: "🔓", desc: "Retire la prise en charge." },
  { value: "add", label: "Ajouter un membre", emoji: "➕", desc: "Ajoute quelqu'un au ticket." },
  { value: "remove", label: "Retirer un membre", emoji: "➖", desc: "Retire quelqu'un du ticket." },
  { value: "rename", label: "Renommer", emoji: "✏️", desc: "Renomme le salon du ticket." },
  { value: "topic", label: "Sujet", emoji: "📝", desc: "Modifie le sujet (formulaire)." },
  { value: "priority", label: "Priorité", emoji: "⚡", desc: "Définit la priorité. (staff)" },
  { value: "transfer", label: "Transférer", emoji: "🔄", desc: "Change le créateur. (staff)" },
  { value: "transcript", label: "Transcript", emoji: "📄", desc: "Génère le transcript." },
  { value: "stats", label: "Statistiques", emoji: "📊", desc: "Stats des tickets. (staff)" },
] as const;

/** Tickets déjà archivés (évite les doubles transcripts / suppressions). */
const archived = new Set<number>();

/** Panneau du hub : titre + menu d'actions. */
function hubPanel(): import("discord.js").ContainerBuilder {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("ticket:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      ACTIONS.map((a) =>
        new StringSelectMenuOptionBuilder().setLabel(a.label).setValue(a.value).setDescription(a.desc).setEmoji(a.emoji)
      )
    );
  const c = panel([textBlock("# 🎫 Tickets\n> Choisis une action ci-dessous.")], BLUE);
  c.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return c;
}

async function deny(interaction: ChatInputCommandInteraction | MessageComponentInteraction, msg: string): Promise<void> {
  const payload = { components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL };
  if (interaction.isMessageComponent()) {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

/** Contexte ticket : salon + ticket ouvert. Null si invalide (réponse déjà envoyée). */
async function ticketContext(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  guild: Guild,
  _member: GuildMember
): Promise<{ ticket: Ticket; channel: TextChannel } | null> {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await deny(interaction, "Utilise cette commande dans un salon ticket.");
    return null;
  }
  const ticket = ticketOfChannel(guild.id, channel.id);
  if (!ticket) {
    await deny(interaction, "Cette commande doit être utilisée dans un salon ticket ouvert.");
    return null;
  }
  return { ticket, channel };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Commande utilisable uniquement sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Actions du hub
// ---------------------------------------------------------------------------

async function actionNew(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const panels = listPanels(guild.id);
  if (panels.length === 0) {
    await deny(interaction, "Aucun panneau de tickets sur ce serveur. Demande à un admin d'en créer un avec `/ticket-panel`.");
    return;
  }
  const existing = getOpenTicketByUser(guild.id, member.id);
  if (existing?.channel_id) {
    await deny(interaction, `Tu as déjà un ticket ouvert : <#${existing.channel_id}>`);
    return;
  }
  const panelRow = panels[panels.length - 1];
  if (!panelRow) {
    await deny(interaction, "Aucun panneau de tickets sur ce serveur.");
    return;
  }
  const created = await createTicketChannel(guild, panelRow, member, "");
  if (!created) {
    await deny(interaction, "Impossible de créer le salon ticket (permissions du bot ?).");
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ Ton ticket a été créé : <#${created.channel.id}>`)],
    flags: FLAGS_V2_EPHEMERAL,
  }).catch(() => {});
}

async function actionClose(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux fermer que tes propres tickets.");
    return;
  }
  await askCloseConfirmation(interaction, ctx.ticket);
}

async function actionClaim(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  if (ctx.ticket.claimed_by) {
    if (ctx.ticket.claimed_by === member.id) {
      await deny(interaction, "Tu as déjà pris ce ticket en charge.");
    } else {
      await deny(interaction, `Ce ticket est déjà pris en charge par <@${ctx.ticket.claimed_by}>.`);
    }
    return;
  }
  dbClaimTicket(ctx.ticket.id, member.id);
  await ctx.channel
    .send({ components: [panel([textBlock(`🙋 <@${member.id}> a pris ce ticket en charge.`)], BLUE)], flags: FLAGS_V2 })
    .catch(() => {});
  await interaction.reply({ components: [okPanel(`✅ Tu as pris en charge le ticket **#${ctx.ticket.id}**.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

async function actionRelease(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!ctx.ticket.claimed_by) {
    await deny(interaction, "Ce ticket n'est pris en charge par personne.");
    return;
  }
  const selfClaim = ctx.ticket.claimed_by === member.id;
  const canRelease = selfClaim || member.permissions.has(PermissionFlagsBits.ManageChannels);
  if (!canRelease) {
    await deny(interaction, "Seul le membre qui a pris le ticket en charge (ou un admin) peut le libérer.");
    return;
  }
  dbReleaseTicket(ctx.ticket.id);
  await ctx.channel
    .send({ components: [panel([textBlock(`🔓 <@${member.id}> a libéré ce ticket.`)], BLUE)], flags: FLAGS_V2 })
    .catch(() => {});
  await interaction.reply({ components: [okPanel(`✅ Ticket **#${ctx.ticket.id}** libéré.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

/** Ouvre le formulaire d'ajout de membre (sélecteur d'utilisateur). */
async function openAddModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:add:${ctx.ticket.id}`).setTitle(`Ajouter un membre — ticket #${ctx.ticket.id}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Membre à ajouter")
      .setDescription("Choisis le membre à ajouter au ticket.")
      .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId("membre").setMaxValues(1))
  );
  await interaction.showModal(modal).catch(() => {});
}

/** Ouvre le formulaire de retrait de membre (sélecteur d'utilisateur). */
async function openRemoveModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:remove:${ctx.ticket.id}`).setTitle(`Retirer un membre — ticket #${ctx.ticket.id}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Membre à retirer")
      .setDescription("Choisis le membre à retirer du ticket.")
      .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId("membre").setMaxValues(1))
  );
  await interaction.showModal(modal).catch(() => {});
}

/** Ouvre le formulaire de renommage (champ texte). */
async function openRenameModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:rename:${ctx.ticket.id}`).setTitle(`Renommer — ticket #${ctx.ticket.id}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Nouveau nom du salon")
      .setTextInputComponent(
        new TextInputBuilder().setCustomId("nom").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(LIMITS.rename)
      )
  );
  await interaction.showModal(modal).catch(() => {});
}

/** Ouvre le formulaire de sujet (champ texte, réutilise le flux existant). */
async function openTopicModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:topic:${ctx.ticket.id}`).setTitle(`Sujet du ticket #${ctx.ticket.id}`);
  const label = new LabelBuilder()
    .setLabel("Sujet du ticket")
    .setDescription("Décris en une phrase l'objet de ce ticket.")
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("topic")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(LIMITS.topic)
        .setRequired(true)
        .setValue(ctx.ticket.topic.slice(0, LIMITS.topic))
    );
  modal.addLabelComponents(label);
  await interaction.showModal(modal).catch(() => {});
}

/** Ouvre le formulaire de priorité (menu déroulant). */
async function openPriorityModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:priority:${ctx.ticket.id}`).setTitle(`Priorité — ticket #${ctx.ticket.id}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Niveau de priorité")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("niveau")
          .setPlaceholder("Choisis une priorité…")
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel("Haute").setValue("haute").setEmoji("🔴"),
            new StringSelectMenuOptionBuilder().setLabel("Normale").setValue("normale").setEmoji("🟡"),
            new StringSelectMenuOptionBuilder().setLabel("Basse").setValue("basse").setEmoji("🟢")
          )
      )
  );
  await interaction.showModal(modal).catch(() => {});
}

/** Ouvre le formulaire de transfert (sélecteur d'utilisateur). */
async function openTransferModal(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:modal:transfer:${ctx.ticket.id}`).setTitle(`Transférer — ticket #${ctx.ticket.id}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Nouveau créateur")
      .setDescription("Le ticket sera transféré à ce membre.")
      .setUserSelectMenuComponent(new UserSelectMenuBuilder().setCustomId("membre").setMaxValues(1))
  );
  await interaction.showModal(modal).catch(() => {});
}

async function actionTranscript(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux voir que tes propres tickets.");
    return;
  }
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
  const md = await buildTranscript(ctx.channel, ctx.ticket);
  const filename = `transcript-ticket-${ctx.ticket.id}.md`;
  await interaction
    .editReply({
      components: [
        panel([textBlock(`# 📄 Transcript — Ticket #${ctx.ticket.id}\n> ${md.split("\n").length} lignes • généré à l'instant.`)], BLUE),
        new FileBuilder().setURL(`attachment://${filename}`),
      ],
      files: [{ attachment: Buffer.from(md, "utf-8"), name: filename }],
    })
    .catch(() => {});
}

async function actionStats(interaction: MessageComponentInteraction, guild: Guild, member: GuildMember): Promise<void> {
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  const s = getTicketStats(guild.id);
  const staff = getStaffStats(guild.id, 10);
  const staffLines =
    staff.length > 0
      ? staff
          .map(
            (st, i) =>
              `> **${i + 1}.** <@${st.staff_id}> — ${st.claimed} ticket${st.claimed > 1 ? "s" : ""} pris en charge` +
              (st.avg_rating !== null ? ` • note moyenne : ${st.avg_rating.toFixed(1)}/5` : "")
          )
          .join("\n")
      : "> *Aucune prise en charge enregistrée.*";
  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`# 📊 Statistiques des tickets`),
          sepBlock(),
          textBlock(
            `> **Total :** ${s.total} • **Ouverts :** ${s.open} • **Fermés :** ${s.closed}\n` +
              `> **Première réponse (moy.) :** ${formatDuration(s.avgFirstResponseMs)}\n` +
              `> **Durée de vie (moy.) :** ${formatDuration(s.avgCloseMs)}\n` +
              `> **Note moyenne :** ${s.avgRating !== null ? `${s.avgRating.toFixed(1)}/5 (${s.feedbackCount} avis)` : "*aucun avis*"}`
          ),
          sepBlock(),
          textBlock(`**Classement du staff**\n${staffLines}`),
        ],
        BLUE
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  }).catch(() => {});
}

/** Demande de confirmation de fermeture (boutons), en éphémère. */
async function askCloseConfirmation(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  ticket: Ticket
): Promise<void> {
  const payload = {
    components: [
      panel(
        [
          textBlock(`# 🔒 Fermer le ticket #${ticket.id} ?\n> Le salon sera verrouillé, un feedback te sera demandé, puis le salon sera supprimé.`),
        ],
        GOLD
      ),
      actionRow(
        button(`ticket:closeconfirm:${ticket.id}`, "Confirmer", ButtonStyle.Danger, "🔒"),
        button(`ticket:closecancel:${ticket.id}`, "Annuler", ButtonStyle.Secondary)
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
  if (interaction.isMessageComponent()) {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Boutons & menus (customId préfixés `ticket:`)
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "ticket") return;

  const kind = parts[1];
  try {
    switch (kind) {
      case "menu": {
        if (!interaction.isStringSelectMenu()) return;
        const action = interaction.values[0];
        if (!action) return;
        await handleHubAction(interaction, guild, member, action);
        break;
      }
      case "close": {
        const ticketId = Number(parts[2]);
        if (!Number.isInteger(ticketId)) return;
        await handleCloseButton(interaction, guild, member, ticketId);
        break;
      }
      case "claim": {
        const ticketId = Number(parts[2]);
        if (!Number.isInteger(ticketId)) return;
        await handleClaimButton(interaction, guild, member, ticketId);
        break;
      }
      case "closeconfirm": {
        const ticketId = Number(parts[2]);
        if (!Number.isInteger(ticketId)) return;
        await handleCloseConfirm(interaction, guild, member, ticketId);
        break;
      }
      case "closecancel": {
        await interaction.update({ components: [msgPanel("❌ Fermeture annulée.", GOLD)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
        break;
      }
      case "star": {
        const ticketId = Number(parts[2]);
        const n = Number(parts[3]);
        if (!Number.isInteger(ticketId) || ![1, 2, 3, 4, 5].includes(n)) return;
        await handleStar(interaction, guild, member, ticketId, n);
        break;
      }
      case "skipfb": {
        const ticketId = Number(parts[2]);
        if (!Number.isInteger(ticketId)) return;
        await handleSkipFeedback(interaction, guild, member, ticketId);
        break;
      }
      case "fbcommentbtn": {
        const ticketId = Number(parts[2]);
        if (!Number.isInteger(ticketId)) return;
        await handleFeedbackCommentButton(interaction, guild, member, ticketId);
        break;
      }
    }
  } catch (err) {
    console.error(`[tickets] erreur composant ${interaction.customId}`, err);
  }
}

/** Routage des actions choisies dans le menu du hub. */
async function handleHubAction(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  action: string
): Promise<void> {
  switch (action) {
    case "new":
      await actionNew(interaction, guild, member);
      break;
    case "close":
      await actionClose(interaction, guild, member);
      break;
    case "claim":
      await actionClaim(interaction, guild, member);
      break;
    case "release":
      await actionRelease(interaction, guild, member);
      break;
    case "add":
      await openAddModal(interaction, guild, member);
      break;
    case "remove":
      await openRemoveModal(interaction, guild, member);
      break;
    case "rename":
      await openRenameModal(interaction, guild, member);
      break;
    case "topic":
      await openTopicModal(interaction, guild, member);
      break;
    case "priority":
      await openPriorityModal(interaction, guild, member);
      break;
    case "transfer":
      await openTransferModal(interaction, guild, member);
      break;
    case "transcript":
      await actionTranscript(interaction, guild, member);
      break;
    case "stats":
      await actionStats(interaction, guild, member);
      break;
    default:
      await deny(interaction, "Action inconnue.");
  }
}

/** Bouton "Fermer" du message de bienvenue → demande confirmation. */
async function handleCloseButton(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number
): Promise<void> {
  const ticket = checkTicket(guild.id, ticketId);
  if (!ticket) {
    await deny(interaction, "Ticket introuvable ou déjà fermé.");
    return;
  }
  if (!canManageTicket(member, ticket, guild.id)) {
    await deny(interaction, "Tu ne peux fermer que tes propres tickets.");
    return;
  }
  await askCloseConfirmation(interaction, ticket);
}

/** Bouton "Prendre en charge" du message de bienvenue. */
async function handleClaimButton(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number
): Promise<void> {
  const ticket = checkTicket(guild.id, ticketId);
  if (!ticket) {
    await deny(interaction, "Ticket introuvable ou déjà fermé.");
    return;
  }
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  if (ticket.claimed_by) {
    await deny(interaction, ticket.claimed_by === member.id ? "Tu as déjà pris ce ticket en charge." : `Déjà pris en charge par <@${ticket.claimed_by}>.`);
    return;
  }
  dbClaimTicket(ticket.id, member.id);
  const ch = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;
  if (ch && ch.type === ChannelType.GuildText) {
    await ch
      .send({ components: [panel([textBlock(`🙋 <@${member.id}> a pris ce ticket en charge.`)], BLUE)], flags: FLAGS_V2 })
      .catch(() => {});
  }
  await interaction.reply({ components: [okPanel(`✅ Tu as pris en charge le ticket **#${ticket.id}**.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

/** Confirmation de fermeture : verrouille, demande le feedback, planifie l'archivage. */
async function handleCloseConfirm(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number
): Promise<void> {
  const ticket = checkTicket(guild.id, ticketId);
  if (!ticket) {
    await deny(interaction, "Ticket introuvable ou déjà fermé.");
    return;
  }
  if (!canManageTicket(member, ticket, guild.id)) {
    await deny(interaction, "Tu ne peux fermer que tes propres tickets.");
    return;
  }
  await interaction.deferUpdate().catch(() => {});
  await finalizeClose(guild, ticket);

  // Sécurité : si personne ne donne de feedback, archive + supprime quand même après 5 min.
  setTimeout(async () => {
    if (archived.has(ticket.id)) return;
    archived.add(ticket.id);
    await sendTranscriptToLog(guild, { ...ticket, status: "closed", closed_at: Date.now() }).catch(() => {});
    if (ticket.channel_id) scheduleChannelDelete(guild, ticket.channel_id, ticket.id, 1000);
  }, 5 * 60 * 1000).unref?.();

  const starRow = actionRow(
    ...[1, 2, 3, 4, 5].map((n) => button(`ticket:star:${ticket.id}:${n}`, `${n}⭐`, n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary))
  );
  await interaction
    .followUp({
      components: [
        panel(
          [textBlock(`# 🔒 Ticket #${ticket.id} fermé\n> Comment s'est passée la prise en charge ? Clique sur une note (1 à 5 étoiles).`)],
          GREEN
        ),
        starRow,
        actionRow(button(`ticket:skipfb:${ticket.id}`, "Passer", ButtonStyle.Secondary)),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    })
    .catch(() => {});
}

/** Note 1-5 : enregistre le feedback, archive le transcript, supprime le salon après 10 s. */
async function handleStar(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number,
  n: number
): Promise<void> {
  const ticket = getTicket(ticketId);
  if (!ticket || ticket.guild_id !== guild.id) {
    await deny(interaction, "Ticket introuvable.");
    return;
  }
  if (!canManageTicket(member, ticket, guild.id)) {
    await deny(interaction, "Tu ne peux noter que tes propres tickets.");
    return;
  }
  if (archived.has(ticket.id)) {
    await interaction.reply({ components: [okPanel("Feedback déjà enregistré, merci !")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }
  archived.add(ticket.id);
  saveFeedback(ticket.id, guild.id, member.id, n);
  await interaction.deferUpdate().catch(() => {});
  await sendTranscriptToLog(guild, ticket).catch(() => {});
  await interaction
    .followUp({
      components: [
        okPanel(`Merci pour ton retour : ${stars(n)}\n> Le transcript a été archivé. Le salon sera supprimé dans 10 secondes.`),
        actionRow(button(`ticket:fbcommentbtn:${ticket.id}`, "Ajouter un commentaire", ButtonStyle.Secondary, "💬")),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    })
    .catch(() => {});
  if (ticket.channel_id) scheduleChannelDelete(guild, ticket.channel_id, ticket.id, 10_000);
}

/** "Passer" le feedback : archive quand même, supprime après 10 s. */
async function handleSkipFeedback(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number
): Promise<void> {
  const ticket = getTicket(ticketId);
  if (!ticket || ticket.guild_id !== guild.id) {
    await deny(interaction, "Ticket introuvable.");
    return;
  }
  if (!canManageTicket(member, ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  if (!archived.has(ticket.id)) {
    archived.add(ticket.id);
    await sendTranscriptToLog(guild, ticket).catch(() => {});
  }
  await interaction.update({ components: [okPanel("👋 Pas de souci ! Le salon sera supprimé dans 10 secondes.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
  if (ticket.channel_id) scheduleChannelDelete(guild, ticket.channel_id, ticket.id, 10_000);
}

/** Bouton "Ajouter un commentaire" → ouvre le modal de commentaire. */
async function handleFeedbackCommentButton(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  ticketId: number
): Promise<void> {
  const ticket = getTicket(ticketId);
  if (!ticket || ticket.guild_id !== guild.id) {
    await deny(interaction, "Ticket introuvable.");
    return;
  }
  const fb = getFeedback(ticketId);
  if (!fb || fb.user_id !== member.id) {
    await deny(interaction, "Tu dois d'abord donner une note pour commenter.");
    return;
  }
  const modal = new ModalBuilder().setCustomId(`ticket:fbcomment:${ticketId}`).setTitle(`Commentaire — ticket #${ticketId}`);
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Ton commentaire (optionnel)")
      .setTextInputComponent(
        new TextInputBuilder().setCustomId("comment").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false)
      )
  );
  await interaction.showModal(modal).catch(() => {});
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

async function denyModal(interaction: ModalSubmitInteraction, msg: string): Promise<void> {
  await interaction.reply({ components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const member = interaction.member as GuildMember | null;
  if (!member || interaction.user.bot) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "ticket") return;
  const kind = parts[1];
  const ticketId = Number(parts[2]);
  if (!Number.isInteger(ticketId)) return;

  if (kind === "topic") {
    const ticket = checkTicket(guild.id, ticketId);
    if (!ticket) {
      await denyModal(interaction, "Ticket introuvable ou déjà fermé.");
      return;
    }
    if (!canManageTicket(member, ticket, guild.id)) {
      await denyModal(interaction, "Tu ne peux gérer que tes propres tickets.");
      return;
    }
    const topic = interaction.fields.getTextInputValue("topic").trim().slice(0, LIMITS.topic);
    setTicketTopic(ticketId, topic);
    if (ticket.channel_id) {
      const ch = await guild.channels.fetch(ticket.channel_id).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText) {
        await ch.setTopic(`Ticket #${ticket.id} — ${topic}`.slice(0, 1024)).catch(() => {});
        await ch
          .send({ components: [panel([textBlock(`📝 Sujet mis à jour par <@${member.id}> : **${topic || "*non précisé*"}**`)], BLUE)], flags: FLAGS_V2 })
          .catch(() => {});
      }
    }
    await interaction.reply({ components: [okPanel("✅ Sujet mis à jour.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  if (kind === "fbcomment") {
    const fb = getFeedback(ticketId);
    if (!fb || fb.guild_id !== guild.id || fb.user_id !== member.id) {
      await denyModal(interaction, "Feedback introuvable.");
      return;
    }
    const comment = interaction.fields.getTextInputValue("comment").trim().slice(0, 1000);
    saveFeedback(ticketId, guild.id, member.id, fb.rating, comment);
    await interaction.reply({ components: [okPanel("💬 Commentaire enregistré, merci !")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
    return;
  }

  if (kind === "modal") {
    const action = parts[2] ?? "";
    const id = Number(parts[3]);
    if (!action || !Number.isInteger(id)) return;
    await handleHubModal(interaction, guild, member, action, id);
  }
}

/** Traite les modals ouverts depuis le hub (add / remove / rename / priority / transfer). */
async function handleHubModal(
  interaction: ModalSubmitInteraction,
  guild: Guild,
  member: GuildMember,
  action: string,
  ticketId: number
): Promise<void> {
  const ticket = checkTicket(guild.id, ticketId);
  if (!ticket) {
    await denyModal(interaction, "Ticket introuvable ou déjà fermé.");
    return;
  }
  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await denyModal(interaction, "Salon du ticket introuvable.");
    return;
  }

  switch (action) {
    case "add": {
      if (!canManageTicket(member, ticket, guild.id)) {
        await denyModal(interaction, "Tu ne peux gérer que tes propres tickets.");
        return;
      }
      const user = interaction.fields.getSelectedUsers("membre")?.first();
      if (!user) {
        await denyModal(interaction, "Choisis un membre.");
        return;
      }
      if (user.bot) {
        await denyModal(interaction, "Impossible d'ajouter un bot.");
        return;
      }
      await applyAdd(guild, member, ticket, channel, user);
      await interaction.reply({ components: [okPanel(`✅ <@${user.id}> a été ajouté au ticket.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      break;
    }
    case "remove": {
      if (!canManageTicket(member, ticket, guild.id)) {
        await denyModal(interaction, "Tu ne peux gérer que tes propres tickets.");
        return;
      }
      const user = interaction.fields.getSelectedUsers("membre")?.first();
      if (!user) {
        await denyModal(interaction, "Choisis un membre.");
        return;
      }
      if (user.id === ticket.creator_id) {
        await denyModal(interaction, "Impossible de retirer le créateur du ticket.");
        return;
      }
      const target = await guild.members.fetch(user.id).catch(() => null);
      if (target && isStaff(target, guild.id)) {
        await denyModal(interaction, "Impossible de retirer un membre de l'équipe support.");
        return;
      }
      await channel.permissionOverwrites.delete(user.id).catch(() => null);
      await interaction.reply({ components: [okPanel(`✅ <@${user.id}> a été retiré du ticket.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      break;
    }
    case "rename": {
      if (!canManageTicket(member, ticket, guild.id)) {
        await denyModal(interaction, "Tu ne peux gérer que tes propres tickets.");
        return;
      }
      const name = sanitizeChannelName(interaction.fields.getTextInputValue("nom").trim());
      await channel.setName(name).catch(() => null);
      await interaction.reply({ components: [okPanel(`✅ Salon renommé en **${name}**.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      break;
    }
    case "priority": {
      if (!isStaff(member, guild.id)) {
        await denyModal(interaction, "Réservé à l'équipe support.");
        return;
      }
      const level = interaction.fields.getStringSelectValues("niveau")[0] as Ticket["priority"] | undefined;
      if (!level || !["haute", "normale", "basse"].includes(level)) {
        await denyModal(interaction, "Niveau de priorité invalide.");
        return;
      }
      setTicketPriority(ticket.id, level);
      await channel
        .send({ components: [panel([textBlock(`⚡ Priorité du ticket définie sur **${priorityLabel(level)}** par <@${member.id}>.`)], GOLD)], flags: FLAGS_V2 })
        .catch(() => {});
      await interaction.reply({ components: [okPanel(`✅ Priorité : **${priorityLabel(level)}**.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      break;
    }
    case "transfer": {
      if (!isStaff(member, guild.id)) {
        await denyModal(interaction, "Réservé à l'équipe support.");
        return;
      }
      const user = interaction.fields.getSelectedUsers("membre")?.first();
      if (!user) {
        await denyModal(interaction, "Choisis un membre.");
        return;
      }
      if (user.bot) {
        await denyModal(interaction, "Impossible de transférer à un bot.");
        return;
      }
      if (user.id === ticket.creator_id) {
        await denyModal(interaction, "Cette personne est déjà la créatrice du ticket.");
        return;
      }
      const target = await guild.members.fetch(user.id).catch(() => null);
      if (!target) {
        await denyModal(interaction, "Ce membre n'est pas sur le serveur.");
        return;
      }
      await channel.permissionOverwrites.delete(ticket.creator_id).catch(() => null);
      await channel.permissionOverwrites
        .edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
        .catch(() => null);
      dbTransferTicket(ticket.id, user.id);
      await channel
        .send({ components: [panel([textBlock(`🔄 Ticket transféré à <@${user.id}> par <@${member.id}>.`)], BLUE)], flags: FLAGS_V2 })
        .catch(() => {});
      await interaction.reply({ components: [okPanel(`✅ Ticket transféré à <@${user.id}>.`)], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      break;
    }
    default:
      await denyModal(interaction, "Action inconnue.");
  }
}

/** Applique l'ajout d'un membre au salon ticket. */
async function applyAdd(
  _guild: Guild,
  _member: GuildMember,
  _ticket: Ticket,
  channel: TextChannel,
  user: User
): Promise<void> {
  await channel.permissionOverwrites
    .edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    })
    .catch(() => null);
}
