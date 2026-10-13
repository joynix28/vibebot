import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
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
  TextBasedChannel,
  GuildMember,
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
  .setDescription("Gère les recrutements et candidatures du serveur.")
  .addSubcommand((s) =>
    s
      .setName("creer")
      .setDescription("Crée un recrutement avec un panel « Postuler ».")
      .addStringOption((o) => o.setName("titre").setDescription("Titre du recrutement.").setRequired(true).setMaxLength(100))
      .addStringOption((o) =>
        o
          .setName("questions")
          .setDescription("Questions séparées par | (1 à 5).")
          .setRequired(true)
          .setMaxLength(1500)
      )
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon du panel (défaut : salon actuel).").addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Liste les recrutements du serveur."))
  .addSubcommand((s) =>
    s
      .setName("fermer")
      .setDescription("Ferme un recrutement (plus de candidatures).")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du recrutement.").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s
      .setName("config")
      .setDescription("Définit le salon staff qui reçoit les candidatures.")
      .addChannelOption((o) =>
        o.setName("staff").setDescription("Salon staff.").setRequired(true).addChannelTypes(ChannelType.GuildText)
      )
  );

function staffOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction): boolean {
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
  guild: NonNullable<ChatInputCommandInteraction["guild"]>,
  channelId: string
): Promise<TextBasedChannel | null> {
  return (await guild.channels.fetch(channelId).catch(() => null)) as TextBasedChannel | null;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "config") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const staff = interaction.options.getChannel("staff", true);
    setRecruitStaffChannel(guild.id, staff.id);
    await interaction.reply({ components: [okPanel(`📥 Les candidatures seront envoyées dans <#${staff.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (sub === "liste") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const recs = listRecruitments(guild.id);
    if (recs.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun recrutement pour le moment. Crée-en un avec `/candidature creer`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const lines = recs.map((r) => {
      const n = countApplications(r.id);
      const state = r.open ? "🟢 Ouvert" : "🔒 Fermé";
      return `\`#${r.id}\` **${r.title}** — ${state} — <#${r.channel_id}> — ${n} candidature(s)`;
    });
    await interaction.reply({
      components: [panel([textBlock("## 📋 Recrutements"), sepBlock(false), textBlock(lines.join("\n"))], BLUE)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "fermer") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const id = interaction.options.getInteger("id", true);
    const rec = getRecruitment(id);
    if (!rec || rec.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel(`Recrutement #${id} introuvable.`)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (!rec.open) {
      await interaction.reply({ components: [errPanel(`Le recrutement #${id} est déjà fermé.`),], flags: FLAGS_V2_EPHEMERAL });
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
    return;
  }

  // creer
  if (!staffOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const staffChannelId = getRecruitStaffChannel(guild.id);
  if (!staffChannelId) {
    await interaction.reply({
      components: [errPanel("Configure d'abord le salon staff avec `/candidature config`.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const title = interaction.options.getString("titre", true).trim();
  const rawQuestions = interaction.options.getString("questions", true);
  const questions = rawQuestions.split("|").map((q) => q.trim()).filter(Boolean);
  if (questions.length < 1 || questions.length > 5) {
    await interaction.reply({ components: [errPanel("Donne entre 1 et 5 questions, séparées par `|`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const postChannel = (interaction.options.getChannel("salon") ?? interaction.channel) as TextBasedChannel | null;
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
