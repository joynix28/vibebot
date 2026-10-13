import {
  ButtonStyle,
  ChannelType,
  FileBuilder,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
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
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  GOLD,
  RED,
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
  .setDescription("Gère les tickets du serveur.")
  .addSubcommand((s) =>
    s
      .setName("new")
      .setDescription("Ouvre un nouveau ticket.")
      .addStringOption((o) => o.setName("sujet").setDescription("Le sujet de ton ticket.").setMaxLength(LIMITS.topic))
  )
  .addSubcommand((s) => s.setName("close").setDescription("Ferme le ticket actuel."))
  .addSubcommand((s) => s.setName("claim").setDescription("Prend en charge le ticket actuel."))
  .addSubcommand((s) => s.setName("release").setDescription("Libère le ticket actuel (retire la prise en charge)."))
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Ajoute un membre au ticket actuel.")
      .addUserOption((o) => o.setName("membre").setDescription("Le membre à ajouter.").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Retire un membre du ticket actuel.")
      .addUserOption((o) => o.setName("membre").setDescription("Le membre à retirer.").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("rename")
      .setDescription("Renomme le salon du ticket actuel.")
      .addStringOption((o) => o.setName("nom").setDescription("Nouveau nom du salon.").setRequired(true).setMaxLength(LIMITS.rename))
  )
  .addSubcommand((s) => s.setName("topic").setDescription("Modifie le sujet du ticket actuel (formulaire)."))
  .addSubcommand((s) =>
    s
      .setName("priority")
      .setDescription("Définit la priorité du ticket actuel.")
      .addStringOption((o) =>
        o
          .setName("niveau")
          .setDescription("Niveau de priorité.")
          .setRequired(true)
          .addChoices(
            { name: "🔴 Haute", value: "haute" },
            { name: "🟡 Normale", value: "normale" },
            { name: "🟢 Basse", value: "basse" }
          )
      )
  )
  .addSubcommand((s) =>
    s
      .setName("transfer")
      .setDescription("Transfère le ticket à un nouveau créateur.")
      .addUserOption((o) => o.setName("membre").setDescription("Le nouveau créateur du ticket.").setRequired(true))
  )
  .addSubcommand((s) => s.setName("transcript").setDescription("Génère le transcript du ticket actuel."))
  .addSubcommand((s) => s.setName("stats").setDescription("Affiche les statistiques des tickets."));

/** Tickets déjà archivés (évite les doubles transcripts / suppressions). */
const archived = new Set<number>();

async function deny(interaction: ChatInputCommandInteraction | MessageComponentInteraction, msg: string): Promise<void> {
  const payload = { components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL };
  if (interaction.isMessageComponent()) {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

/** Contexte ticket : salon + ticket ouvert + membre. Null si invalide (réponse déjà envoyée). */
async function ticketContext(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  member: GuildMember
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
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "new":
      await runNew(interaction, guild, member);
      break;
    case "close":
      await runClose(interaction, guild, member);
      break;
    case "claim":
      await runClaim(interaction, guild, member);
      break;
    case "release":
      await runRelease(interaction, guild, member);
      break;
    case "add":
      await runAdd(interaction, guild, member);
      break;
    case "remove":
      await runRemove(interaction, guild, member);
      break;
    case "rename":
      await runRename(interaction, guild, member);
      break;
    case "topic":
      await runTopicModal(interaction, guild, member);
      break;
    case "priority":
      await runPriority(interaction, guild, member);
      break;
    case "transfer":
      await runTransfer(interaction, guild, member);
      break;
    case "transcript":
      await runTranscript(interaction, guild, member);
      break;
    case "stats":
      await runStats(interaction, guild, member);
      break;
    default:
      await interaction.reply({ components: [errPanel("Sous-commande inconnue.")], flags: FLAGS_V2_EPHEMERAL });
  }
}

// ---------------------------------------------------------------------------
// Sous-commandes
// ---------------------------------------------------------------------------

async function runNew(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const panels = listPanels(guild.id);
  if (panels.length === 0) {
    await deny(interaction, "Aucun panneau de tickets sur ce serveur. Demande à un admin d'en créer un avec `/ticket-panel creer`.");
    return;
  }
  const existing = getOpenTicketByUser(guild.id, member.id);
  if (existing?.channel_id) {
    await deny(interaction, `Tu as déjà un ticket ouvert : <#${existing.channel_id}>`);
    return;
  }
  const topic = (interaction.options.getString("sujet")?.trim().slice(0, LIMITS.topic)) || "";
  const panelRow = panels[panels.length - 1];
  if (!panelRow) {
    await deny(interaction, "Aucun panneau de tickets sur ce serveur.");
    return;
  }
  const created = await createTicketChannel(guild, panelRow, member, topic);
  if (!created) {
    await deny(interaction, "Impossible de créer le salon ticket (permissions du bot ?).");
    return;
  }
  await interaction.reply({
    components: [okPanel(`✅ Ton ticket a été créé : <#${created.channel.id}>`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function runClose(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux fermer que tes propres tickets.");
    return;
  }
  await askCloseConfirmation(interaction, ctx.ticket);
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

async function runClaim(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
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
  await interaction.reply({ components: [okPanel(`✅ Tu as pris en charge le ticket **#${ctx.ticket.id}**.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runRelease(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
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
  await interaction.reply({ components: [okPanel(`✅ Ticket **#${ctx.ticket.id}** libéré.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runAdd(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const user = interaction.options.getUser("membre", true);
  if (user.bot) {
    await deny(interaction, "Impossible d'ajouter un bot.");
    return;
  }
  await ctx.channel.permissionOverwrites
    .edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
    })
    .catch(() => null);
  await interaction.reply({ components: [okPanel(`✅ <@${user.id}> a été ajouté au ticket.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runRemove(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const user = interaction.options.getUser("membre", true);
  if (user.id === ctx.ticket.creator_id) {
    await deny(interaction, "Impossible de retirer le créateur du ticket (utilise `/ticket transfer`).");
    return;
  }
  const target = await guild.members.fetch(user.id).catch(() => null);
  if (target && isStaff(target, guild.id)) {
    await deny(interaction, "Impossible de retirer un membre de l'équipe support.");
    return;
  }
  await ctx.channel.permissionOverwrites.delete(user.id).catch(() => null);
  await interaction.reply({ components: [okPanel(`✅ <@${user.id}> a été retiré du ticket.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runRename(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!canManageTicket(member, ctx.ticket, guild.id)) {
    await deny(interaction, "Tu ne peux gérer que tes propres tickets.");
    return;
  }
  const name = sanitizeChannelName(interaction.options.getString("nom", true));
  await ctx.channel.setName(name).catch(() => null);
  await interaction.reply({ components: [okPanel(`✅ Salon renommé en **${name}**.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runTopicModal(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
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

async function runPriority(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  const level = interaction.options.getString("niveau", true) as Ticket["priority"];
  if (!["haute", "normale", "basse"].includes(level)) {
    await deny(interaction, "Niveau de priorité invalide.");
    return;
  }
  setTicketPriority(ctx.ticket.id, level);
  await ctx.channel
    .send({ components: [panel([textBlock(`⚡ Priorité du ticket définie sur **${priorityLabel(level)}** par <@${member.id}>.`)], GOLD)], flags: FLAGS_V2 })
    .catch(() => {});
  await interaction.reply({ components: [okPanel(`✅ Priorité : **${priorityLabel(level)}**.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runTransfer(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
  const ctx = await ticketContext(interaction, guild, member);
  if (!ctx) return;
  if (!isStaff(member, guild.id)) {
    await deny(interaction, "Réservé à l'équipe support.");
    return;
  }
  const user = interaction.options.getUser("membre", true);
  if (user.bot) {
    await deny(interaction, "Impossible de transférer à un bot.");
    return;
  }
  if (user.id === ctx.ticket.creator_id) {
    await deny(interaction, "Cette personne est déjà la créatrice du ticket.");
    return;
  }
  const target = await guild.members.fetch(user.id).catch(() => null);
  if (!target) {
    await deny(interaction, "Ce membre n'est pas sur le serveur.");
    return;
  }
  // Retire les droits de l'ancien créateur, donne ceux du nouveau.
  await ctx.channel.permissionOverwrites.delete(ctx.ticket.creator_id).catch(() => null);
  await ctx.channel.permissionOverwrites
    .edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true })
    .catch(() => null);
  dbTransferTicket(ctx.ticket.id, user.id);
  await ctx.channel
    .send({ components: [panel([textBlock(`🔄 Ticket transféré à <@${user.id}> par <@${member.id}>.`)], BLUE)], flags: FLAGS_V2 })
    .catch(() => {});
  await interaction.reply({ components: [okPanel(`✅ Ticket transféré à <@${user.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
}

async function runTranscript(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
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

async function runStats(interaction: ChatInputCommandInteraction, guild: Guild, member: GuildMember): Promise<void> {
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
  });
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
      await interaction.reply({ components: [errPanel("Ticket introuvable ou déjà fermé.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      return;
    }
    if (!canManageTicket(member, ticket, guild.id)) {
      await interaction.reply({ components: [errPanel("Tu ne peux gérer que tes propres tickets.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
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
      await interaction.reply({ components: [errPanel("Feedback introuvable.")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
      return;
    }
    const comment = interaction.fields.getTextInputValue("comment").trim().slice(0, 1000);
    saveFeedback(ticketId, guild.id, member.id, fb.rating, comment);
    await interaction.reply({ components: [okPanel("💬 Commentaire enregistré, merci !")], flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
  }
}
