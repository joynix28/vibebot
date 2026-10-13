import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction, ModalSubmitInteraction, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  okPanel,
  errPanel,
  panel,
  textBlock,
} from "../../../core/ui.ts";
import { getConfessChannel, setConfessChannel } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("confess")
  .setDescription("Envoie une confession anonyme.")
  .addSubcommand((s) =>
    s
      .setName("set-channel")
      .setDescription("Définit le salon des confessions (staff).")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon des confessions.").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand(false);

  if (sub === "set-channel") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const channel = interaction.options.getChannel("salon", true);
    setConfessChannel(guild.id, channel.id);
    await interaction.reply({ components: [okPanel(`Salon des confessions : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // Sans sous-commande : ouvre le formulaire de confession anonyme.
  const channelId = getConfessChannel(guild.id);
  if (!channelId) {
    await interaction.reply({ components: [errPanel("Aucun salon de confessions configuré. Demande au staff d'utiliser `/confess set-channel`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const modal = new ModalBuilder().setCustomId("confess:modal").setTitle("Confession anonyme");
  const input = new TextInputBuilder()
    .setCustomId("text")
    .setLabel("Ta confession")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1500)
    .setPlaceholder("Écris ta confession… elle sera publiée anonymement.");
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "confess:modal") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
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
