import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  GuildMember,
  ContainerBuilder,
} from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  addRecurrent,
  getRecurrent,
  listRecurrents,
  deleteRecurrent,
} from "../func/db-plus.ts";
import { scheduleRecurrent, unscheduleRecurrent } from "../func/recurrent.ts";

export const data = new SlashCommandBuilder()
  .setName("recurrent")
  .setDescription("Gère les messages envoyés automatiquement à intervalle régulier.");

const MENU_ID = "recurrent:menu";
const MODAL_AJOUTER = "recurrent:modal:ajouter";
const MODAL_SUPPRIMER = "recurrent:modal:supprimer";

function adminOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
}

/** Hub : menu d'actions (réponse éphémère). */
function hubComponents(): [ContainerBuilder, ActionRowBuilder<StringSelectMenuBuilder>] {
  const head = panel(
    [
      textBlock("## 🔁 Messages récurrents"),
      textBlock("Programme des messages envoyés automatiquement à intervalle régulier. Choisis une action dans le menu ci-dessous."),
    ],
    GOLD
  );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Choisis une action…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Ajouter un message récurrent")
          .setValue("ajouter")
          .setEmoji("➕")
          .setDescription("Programme un nouvel envoi automatique."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Lister les messages récurrents")
          .setValue("liste")
          .setEmoji("📃")
          .setDescription("Affiche tous les messages programmés."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Supprimer un message récurrent")
          .setValue("supprimer")
          .setEmoji("🗑️")
          .setDescription("Arrête un envoi automatique.")
      )
  );
  return [head, row];
}

function ajouterModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_AJOUTER).setTitle("Message récurrent");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Salon d'envoi")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId("salon")
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder("Choisir le salon…")
      ),
    new LabelBuilder()
      .setLabel("Intervalle (minutes)")
      .setDescription("Entre 5 et 10080 minutes (7 jours).")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("intervalle")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setPlaceholder("Ex : 60")
      ),
    new LabelBuilder()
      .setLabel("Message")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("message")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500)
          .setPlaceholder("Le message à envoyer…")
      )
  );
  return modal;
}

function supprimerModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_SUPPRIMER).setTitle("Supprimer un récurrent");
  modal.addComponents(
    new LabelBuilder().setLabel("ID du message récurrent").setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("id")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setPlaceholder("Ex : 2")
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
  if (!adminOnly(interaction)) {
    await interaction.update({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const rows = listRecurrents(guild.id);
  if (rows.length === 0) {
    await interaction.update({ components: [errPanel("Aucun message récurrent.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = rows.map((r) => {
    const preview = r.message.length > 60 ? r.message.slice(0, 57) + "…" : r.message;
    return `\`#${r.id}\` <#${r.channel_id}> — toutes les **${r.interval_min} min**\n> ${preview}`;
  });
  await interaction.update({
    components: [panel([textBlock("## 🔁 Messages récurrents"), sepBlock(false), textBlock(lines.join("\n\n"))], BLUE)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Logique de l'ancienne sous-commande "supprimer". */
async function runSupprimer(interaction: ModalSubmitInteraction, id: number): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!adminOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const row = getRecurrent(id);
  if (!row || row.guild_id !== guild.id) {
    await interaction.reply({ components: [errPanel(`Message récurrent #${id} introuvable.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  unscheduleRecurrent(id);
  deleteRecurrent(id);
  await interaction.reply({ components: [okPanel(`🗑️ Message récurrent #${id} supprimé.`)], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "ajouter". */
async function runAjouter(
  interaction: ModalSubmitInteraction,
  salonId: string,
  intervalle: number,
  message: string
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!adminOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const row = addRecurrent({
    guildId: guild.id,
    channelId: salonId,
    intervalMin: intervalle,
    message,
    createdBy: interaction.user.id,
  });
  scheduleRecurrent(interaction.client, row);
  await interaction.reply({
    components: [okPanel(`🔁 Message récurrent #${row.id} créé : envoi dans <#${salonId}> toutes les **${intervalle} min**.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId !== MENU_ID) return;
  if (!interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];
  if (action === "liste") {
    await runListe(interaction);
    return;
  }
  if (action === "ajouter") {
    await interaction.showModal(ajouterModal());
    return;
  }
  if (action === "supprimer") {
    await interaction.showModal(supprimerModal());
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === MODAL_AJOUTER) {
    const chans = interaction.fields.getSelectedChannels("salon", true);
    const salonId = chans.firstKey();
    if (!salonId) {
      await interaction.reply({ components: [errPanel("Sélectionne un salon.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const intervalle = parseInt(interaction.fields.getTextInputValue("intervalle").trim(), 10);
    if (!Number.isFinite(intervalle) || intervalle < 5 || intervalle > 10080) {
      await interaction.reply({ components: [errPanel("Intervalle invalide : entre 5 et 10080 minutes.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const message = interaction.fields.getTextInputValue("message").trim();
    if (!message) {
      await interaction.reply({ components: [errPanel("Le message ne peut pas être vide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runAjouter(interaction, salonId, intervalle, message);
    return;
  }

  if (interaction.customId === MODAL_SUPPRIMER) {
    const id = parseInt(interaction.fields.getTextInputValue("id").trim(), 10);
    if (!Number.isFinite(id) || id < 1) {
      await interaction.reply({ components: [errPanel("ID invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runSupprimer(interaction, id);
    return;
  }
}
