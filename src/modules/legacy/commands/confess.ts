import {
  SlashCommandBuilder,
  PermissionFlagsBits,
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
  TextBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  ACCENT,
  okPanel,
  errPanel,
  panel,
  textBlock,
} from "../../../core/ui.ts";
import { getConfessChannel, setConfessChannel } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("confess")
  .setDescription("Envoie une confession anonyme.");

function hubContainer() {
  const container = panel([textBlock("## 💭 Confessions anonymes\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("confess:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Envoyer une confession")
        .setValue("send")
        .setDescription("Publie une confession anonyme.")
        .setEmoji("💭"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Définir le salon (staff)")
        .setValue("set-channel")
        .setDescription("Définit le salon des confessions.")
        .setEmoji("⚙️")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

function confessModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId("confess:modal").setTitle("Confession anonyme");
  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel("Ta confession")
      .setDescription("Elle sera publiée anonymement.")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("text")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500)
          .setPlaceholder("Écris ta confession…")
      )
  );
  return modal;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "confess:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "send") {
    const channelId = getConfessChannel(guild.id);
    if (!channelId) {
      await interaction.update({ components: [errPanel("Aucun salon de confessions configuré. Demande au staff de le définir via ce menu.")], flags: FLAGS_V2 });
      return;
    }
    await interaction.showModal(confessModal());
    return;
  }

  if (action === "set-channel") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.update({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2 });
      return;
    }
    const modal = new ModalBuilder().setCustomId("confess:modal:set-channel").setTitle("Salon des confessions");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Salon")
        .setDescription("Mentionne le salon ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("salon")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder("#confessions ou 123456789…")
        )
    );
    await interaction.showModal(modal);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // Configuration du salon (staff).
  if (interaction.customId === "confess:modal:set-channel") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const raw = interaction.fields.getTextInputValue("salon");
    const channelId = raw.match(/\d{17,20}/)?.[0];
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ components: [errPanel("Salon introuvable. Mentionne un salon textuel valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setConfessChannel(guild.id, channel.id);
    await interaction.reply({ components: [okPanel(`Salon des confessions : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId !== "confess:modal") return;
  const text = interaction.fields.getTextInputValue("text").trim();
  if (!text) {
    await interaction.reply({ components: [errPanel("La confession est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const channelId = getConfessChannel(guild.id);
  const channel = channelId ? ((await guild.channels.fetch(channelId).catch(() => null)) as TextBasedChannel | null) : null;
  if (!channel?.isSendable()) {
    await interaction.reply({ components: [errPanel("Le salon des confessions est introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sent = await channel
    .send({ components: [panel([textBlock(`## 💭 Confession anonyme\n${text}`)], BLUE)], flags: FLAGS_V2 })
    .catch(() => null);
  if (!sent) {
    await interaction.reply({ components: [errPanel("Impossible de publier la confession.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [okPanel("🤫 Confession publiée anonymement.")], flags: FLAGS_V2_EPHEMERAL });
}
