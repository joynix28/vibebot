import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder,
  ActionRowBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  TextBasedChannel,
  GuildMember,
  Guild,
  User,
  Client,
  ContainerBuilder,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  RED,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  actionRow,
  button,
} from "../../../core/ui.ts";
import {
  createRecruitment,
  getRecruitment,
  listRecruitments,
  setRecruitmentMessage,
  closeRecruitment,
  countApplications,
  addApplication,
  getPendingApplication,
  getApplication,
  listApplications,
  setApplicationStatus,
  setApplicationStaffMessage,
  getRecruitStaffChannel,
  setRecruitStaffChannel,
} from "../func/db-plus.ts";
import type { Recruitment, Application } from "../func/db-plus.ts";

export const data = new SlashCommandBuilder()
  .setName("candidature")
  .setDescription("Gère les recrutements et candidatures du serveur.");

const MENU_ID = "candidature:menu";
const MODAL_CREER = "candidature:modal:creer";
const MODAL_FERMER = "candidature:modal:fermer";
const MODAL_CONFIG = "candidature:modal:config";

function staffOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
}

/** Panneau affiché dans le salon de recrutement. */
function buildRecruitPanel(rec: Recruitment, applications: number) {
  const questions = rec.questions.map((q, i) => `\`${i + 1}.\` ${q}`).join("\n");
  const head = panel(
    [
      textBlock(`## 📋 ${rec.title}`),
      textBlock(`*${applications} candidature(s) reçue(s)*`),
      sepBlock(false),
      textBlock(`**Questions :**\n${questions}`),
      textBlock(rec.open ? "*Clique sur **Postuler** pour envoyer ta candidature.*" : "🔒 **Recrutement fermé.**"),
    ],
    rec.open ? GOLD : BLUE
  );
  if (!rec.open) return [head];
  return [head, actionRow(button(`candidature:postuler:${rec.id}`, "Postuler", ButtonStyle.Success, "📝"))];
}

function buildApplicationPanel(app: Application, rec: Recruitment) {
  const lines = rec.questions.map((q, i) => `**${q}**\n> ${app.answers[`q${i}`] ?? "*—*"}`).join("\n\n");
  const statusLine =
    app.status === "accepted"
      ? "✅ **Acceptée**"
      : app.status === "refused"
        ? "❌ **Refusée**"
        : "⏳ **En attente**";
  const head = panel(
    [
      textBlock(`## 📥 Nouvelle candidature — ${rec.title}`),
      textBlock(`Candidat : <@${app.user_id}> (\`${app.user_id}\`)\nStatut : ${statusLine}`),
      sepBlock(false),
      textBlock(lines),
    ],
    app.status === "accepted" ? GREEN : app.status === "refused" ? RED : GOLD
  );
  if (app.status !== "pending") return [head];
  return [
    head,
    actionRow(
      button(`candidature:accepter:${app.id}`, "Accepter", ButtonStyle.Success, "✅"),
      button(`candidature:refuser:${app.id}`, "Refuser", ButtonStyle.Danger, "❌")
    ),
  ];
}

async function fetchChannel(
  guild: Guild,
  channelId: string
): Promise<TextBasedChannel | null> {
  return (await guild.channels.fetch(channelId).catch(() => null)) as TextBasedChannel | null;
}

/** Hub : menu d'actions (réponse éphémère). */
function hubComponents(): [ContainerBuilder, ActionRowBuilder<StringSelectMenuBuilder>] {
  const head = panel(
    [
      textBlock("## 📋 Candidatures"),
      textBlock("Gère les recrutements du serveur. Choisis une action dans le menu ci-dessous."),
    ],
    GOLD
  );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Choisis une action…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Créer un recrutement")
          .setValue("creer")
          .setEmoji("📝")
          .setDescription("Publie un panel « Postuler » dans un salon."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Lister les recrutements")
          .setValue("liste")
          .setEmoji("📃")
          .setDescription("Affiche tous les recrutements du serveur."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Fermer un recrutement")
          .setValue("fermer")
          .setEmoji("🔒")
          .setDescription("Ferme un recrutement (plus de candidatures)."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Configurer le salon staff")
          .setValue("config")
          .setEmoji("⚙️")
          .setDescription("Définit le salon qui reçoit les candidatures.")
      )
  );
  return [head, row];
}

function creerModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_CREER).setTitle("Créer un recrutement");
  modal.addComponents(
    new LabelBuilder().setLabel("Titre").setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("titre")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder("Ex : Modérateurs")
    ),
    new LabelBuilder()
      .setLabel("Questions")
      .setDescription("1 à 5 questions, séparées par |")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("questions")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500)
          .setPlaceholder("Question 1 | Question 2 | Question 3")
      ),
    new LabelBuilder()
      .setLabel("Salon du panel")
      .setDescription("Laisse vide pour utiliser le salon actuel.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId("salon")
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder("Salon du panel…")
      )
  );
  return modal;
}

function fermerModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_FERMER).setTitle("Fermer un recrutement");
  modal.addComponents(
    new LabelBuilder().setLabel("ID du recrutement").setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("id")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setPlaceholder("Ex : 3")
    )
  );
  return modal;
}

function configModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_CONFIG).setTitle("Salon staff des candidatures");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Salon staff")
      .setDescription("Les candidatures y seront envoyées.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId("staff")
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder("Choisir le salon staff…")
      )
  );
  return modal;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const [head, row] = hubComponents();
  await interaction.reply({ components: [head, row], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "liste". */
async function runListe(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.update({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!staffOnly(interaction)) {
    await interaction.update({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const recs = listRecruitments(guild.id);
  if (recs.length === 0) {
    await interaction.update({ components: [errPanel("Aucun recrutement pour le moment.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = recs.map((r) => {
    const n = countApplications(r.id);
    const state = r.open ? "🟢 Ouvert" : "🔒 Fermé";
    return `\`#${r.id}\` **${r.title}** — ${state} — <#${r.channel_id}> — ${n} candidature(s)`;
  });
  await interaction.update({
    components: [panel([textBlock("## 📋 Recrutements"), sepBlock(false), textBlock(lines.join("\n"))], BLUE)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Logique de l'ancienne sous-commande "fermer". */
async function runFermer(interaction: ModalSubmitInteraction, id: number): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!staffOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const rec = getRecruitment(id);
  if (!rec || rec.guild_id !== guild.id) {
    await interaction.reply({ components: [errPanel(`Recrutement #${id} introuvable.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!rec.open) {
    await interaction.reply({ components: [errPanel(`Le recrutement #${id} est déjà fermé.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  closeRecruitment(id);
  const closed = { ...rec, open: 0 };
  if (rec.message_id) {
    const channel = await fetchChannel(guild, rec.channel_id);
    const msg = channel?.isTextBased() ? await channel.messages.fetch(rec.message_id).catch(() => null) : null;
    if (msg) await msg.edit({ components: buildRecruitPanel(closed, countApplications(id)) }).catch(() => {});
  }
  await interaction.reply({ components: [okPanel(`🔒 Recrutement **${rec.title}** (#${id}) fermé.`)], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "config". */
async function runConfig(interaction: ModalSubmitInteraction, staffChannelId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!staffOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setRecruitStaffChannel(guild.id, staffChannelId);
  await interaction.reply({ components: [okPanel(`📥 Les candidatures seront envoyées dans <#${staffChannelId}>.`)], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "creer". */
async function runCreer(
  interaction: ModalSubmitInteraction,
  titre: string,
  questionsRaw: string,
  postChannel: TextBasedChannel | null
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!staffOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const staffChannelId = getRecruitStaffChannel(guild.id);
  if (!staffChannelId) {
    await interaction.reply({
      components: [errPanel("Configure d'abord le salon staff via le menu « Configurer le salon staff ».")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const title = titre.trim();
  const questions = questionsRaw.split("|").map((q) => q.trim()).filter(Boolean);
  if (questions.length < 1 || questions.length > 5) {
    await interaction.reply({ components: [errPanel("Donne entre 1 et 5 questions, séparées par `|`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!postChannel?.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon de publication invalide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const rec = createRecruitment({
    guildId: guild.id,
    channelId: postChannel.id,
    title,
    questions,
    createdBy: interaction.user.id,
  });
  const sent = await postChannel
    .send({ components: buildRecruitPanel(rec, 0), flags: FLAGS_V2 })
    .catch(() => null);
  if (!sent) {
    await interaction.reply({ components: [errPanel("Impossible de publier le panel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setRecruitmentMessage(rec.id, sent.id);
  await interaction.reply({
    components: [okPanel(`📋 Recrutement **${title}** (#${rec.id}) publié dans <#${postChannel.id}>.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  // Menu du hub.
  if (interaction.customId === MENU_ID) {
    if (!interaction.isStringSelectMenu()) return;
    const action = interaction.values[0];
    if (action === "liste") {
      await runListe(interaction);
      return;
    }
    if (action === "creer") {
      await interaction.showModal(creerModal());
      return;
    }
    if (action === "fermer") {
      await interaction.showModal(fermerModal());
      return;
    }
    if (action === "config") {
      await interaction.showModal(configModal());
      return;
    }
    return;
  }

  const [_, action, arg] = interaction.customId.split(":");
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette action doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // candidature:postuler:<recruitmentId> → ouvre le formulaire.
  if (action === "postuler") {
    const rec = getRecruitment(Number(arg));
    if (!rec || rec.guild_id !== guild.id || !rec.open) {
      await interaction.reply({ components: [errPanel("Ce recrutement est fermé ou introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (getPendingApplication(rec.id, interaction.user.id)) {
      await interaction.reply({ components: [errPanel("Tu as déjà une candidature en attente pour ce recrutement.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const modal = new ModalBuilder().setCustomId(`candidature:modal:${rec.id}`).setTitle(`Candidature — ${rec.title.slice(0, 30)}`);
    for (let i = 0; i < rec.questions.length; i++) {
      const q = rec.questions[i]!;
      const input = new TextInputBuilder()
        .setCustomId(`q${i}`)
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder("Ta réponse…");
      const label = new LabelBuilder()
        .setLabel(q.length > 45 ? q.slice(0, 42) + "…" : q)
        .setTextInputComponent(input);
      if (q.length > 45) label.setDescription(q.slice(0, 100));
      modal.addComponents(label);
    }
    await interaction.showModal(modal);
    return;
  }

  // candidature:accepter:<appId> / candidature:refuser:<appId> (staff)
  if (action === "accepter" || action === "refuser") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const app = getApplication(Number(arg));
    if (!app || app.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel("Candidature introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (app.status !== "pending") {
      await interaction.reply({ components: [errPanel("Cette candidature a déjà été traitée.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const status: "accepted" | "refused" = action === "accepter" ? "accepted" : "refused";
    setApplicationStatus(app.id, status);
    const rec = getRecruitment(app.recruitment_id);
    const updated = { ...app, status };
    if (app.staff_message_id) {
      const staffChannelId = getRecruitStaffChannel(guild.id);
      const channel = staffChannelId ? await fetchChannel(guild, staffChannelId) : null;
      const msg = channel?.isTextBased() ? await channel.messages.fetch(app.staff_message_id).catch(() => null) : null;
      if (msg && rec) await msg.edit({ components: buildApplicationPanel(updated, rec) }).catch(() => {});
    }
    const member = await guild.members.fetch(app.user_id).catch(() => null);
    if (member) {
      const dmText =
        status === "accepted"
          ? `✅ Bonne nouvelle ! Ta candidature pour **${rec?.title ?? "le recrutement"}** a été **acceptée**.`
          : `❌ Ta candidature pour **${rec?.title ?? "le recrutement"}** a été **refusée**.`;
      await member.send({ components: [panel([textBlock(dmText)], status === "accepted" ? GREEN : RED)], flags: FLAGS_V2 }).catch(() => {});
    }
    await interaction.reply({
      components: [okPanel(status === "accepted" ? `✅ Candidature #${app.id} acceptée.` : `❌ Candidature #${app.id} refusée.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "candidature" || parts[1] !== "modal") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette action doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // Nouveaux modals du hub.
  if (parts[2] === "creer") {
    const titre = interaction.fields.getTextInputValue("titre");
    const questions = interaction.fields.getTextInputValue("questions");
    const selected = interaction.fields.getSelectedChannels("salon");
    const postChannel =
      (selected?.first() as TextBasedChannel | undefined) ??
      (interaction.channel as TextBasedChannel | null);
    await runCreer(interaction, titre, questions, postChannel);
    return;
  }
  if (parts[2] === "fermer") {
    const id = parseInt(interaction.fields.getTextInputValue("id").trim(), 10);
    if (!Number.isFinite(id) || id < 1) {
      await interaction.reply({ components: [errPanel("ID invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runFermer(interaction, id);
    return;
  }
  if (parts[2] === "config") {
    const selected = interaction.fields.getSelectedChannels("staff", true);
    const first = selected.first();
    if (!first) {
      await interaction.reply({ components: [errPanel("Sélectionne un salon.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runConfig(interaction, first.id);
    return;
  }

  // Modal existant : candidature:modal:<recruitmentId> (formulaire de postulation).
  const rec = getRecruitment(Number(parts[2]));
  if (!rec || rec.guild_id !== guild.id || !rec.open) {
    await interaction.reply({ components: [errPanel("Ce recrutement est fermé ou introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (getPendingApplication(rec.id, interaction.user.id)) {
    await interaction.reply({ components: [errPanel("Tu as déjà une candidature en attente pour ce recrutement.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const answers: Record<string, string> = {};
  for (let i = 0; i < rec.questions.length; i++) {
    answers[`q${i}`] = interaction.fields.getTextInputValue(`q${i}`).trim();
  }
  const app = addApplication(rec.id, guild.id, interaction.user.id, answers);

  const staffChannelId = getRecruitStaffChannel(guild.id);
  const staffChannel = staffChannelId ? await fetchChannel(guild, staffChannelId) : null;
  if (!staffChannel?.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon staff introuvable. Préviens un administrateur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sent = await staffChannel
    .send({ components: buildApplicationPanel(app, rec), flags: FLAGS_V2 })
    .catch(() => null);
  if (sent) setApplicationStaffMessage(app.id, sent.id);
  await interaction.reply({
    components: [okPanel("📨 Candidature envoyée au staff. Tu recevras la réponse en message privé.")],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Candidatures d'un recrutement (utilisé par le dashboard / futurs usages). */
export function applicationsOf(recruitmentId: number): Application[] {
  return listApplications(recruitmentId);
}
