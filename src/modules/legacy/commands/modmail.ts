import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
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
  fieldRaw,
} from "../../../core/ui.ts";
import {
  getModmailConfig,
  setModmailConfig,
  getTicketByChannel,
  listOpenTickets,
  closeTicket,
} from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("Configure et gère le ModMail (MPs au bot → salon staff).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

function hubContainer() {
  const container = panel([textBlock("## 📬 ModMail\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("modmail:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Définir la catégorie")
        .setValue("set-category")
        .setDescription("Catégorie des salons ModMail.")
        .setEmoji("📁"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Salon de logs")
        .setValue("log-channel")
        .setDescription("Définit le salon de logs du ModMail.")
        .setEmoji("📝"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Fermer le ticket actuel")
        .setValue("close")
        .setDescription("Ferme le ticket ModMail du salon actuel.")
        .setEmoji("🔒"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lister les tickets ouverts")
        .setValue("list")
        .setDescription("Affiche les tickets ModMail ouverts.")
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
  if (!interaction.isStringSelectMenu() || interaction.customId !== "modmail:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "set-category" || action === "log-channel") {
    const isCategory = action === "set-category";
    const modal = new ModalBuilder()
      .setCustomId(`modmail:modal:${action}`)
      .setTitle(isCategory ? "Catégorie ModMail" : "Salon de logs ModMail");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel(isCategory ? "Catégorie" : "Salon")
        .setDescription(isCategory ? "Mentionne la catégorie ou colle son ID." : "Mentionne le salon ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("cible")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50)
            .setPlaceholder(isCategory ? "ID de la catégorie…" : "#logs ou ID…")
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "close") {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.guild_id !== guild.id) {
      await interaction.update({ components: [errPanel("Ce salon n'est pas un ticket ModMail ouvert.")], flags: FLAGS_V2 });
      return;
    }
    closeTicket(ticket.id);
    const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
    if (user) {
      await user.send({ components: [panel([textBlock(`## 📬 Ticket fermé\nLe staff de **${guild.name}** a fermé ta conversation.`)], BLUE)] }).catch(() => {});
    }
    await interaction.update({ components: [okPanel(`Ticket #${ticket.id} fermé. Le salon sera supprimé dans quelques secondes.`)], flags: FLAGS_V2 });
    setTimeout(() => {
      const ch = interaction.channel as TextBasedChannel | null;
      ch?.delete?.("Ticket ModMail fermé").catch(() => {});
    }, 5000);
    return;
  }

  if (action === "list") {
    const tickets = listOpenTickets(guild.id);
    if (tickets.length === 0) {
      await interaction.update({ components: [okPanel("Aucun ticket ModMail ouvert.")], flags: FLAGS_V2 });
      return;
    }
    const lines = tickets.map((t) => `\`#${t.id}\` — <@${t.user_id}> — <#${t.channel_id ?? "?"}> — <t:${Math.floor(t.created_at / 1000)}:R>`).join("\n");
    await interaction.update({ components: [panel([textBlock(`## 📬 Tickets ModMail ouverts\n${lines}`)], BLUE)], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === "modmail:modal:set-category") {
    const channelId = interaction.fields.getTextInputValue("cible").match(/\d{17,20}/)?.[0];
    const category = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!category || category.type !== ChannelType.GuildCategory) {
      await interaction.reply({ components: [errPanel("Catégorie introuvable. Mentionne une catégorie valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setModmailConfig(guild.id, { category_id: category.id });
    await interaction.reply({
      components: [
        okPanel(
          `## ✅ ModMail activé\n${fieldRaw("Catégorie", category.name ?? "?")}\n\nLes membres peuvent maintenant envoyer un MP au bot pour contacter le staff.`
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (interaction.customId === "modmail:modal:log-channel") {
    const channelId = interaction.fields.getTextInputValue("cible").match(/\d{17,20}/)?.[0];
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ components: [errPanel("Salon introuvable. Mentionne un salon textuel valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setModmailConfig(guild.id, { log_channel: channel.id });
    await interaction.reply({ components: [okPanel(`Salon de logs ModMail : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
}

/** Retourne la config ModMail (utilisée par l'event messageCreate). */
export function modmailConfigOf(guildId: string) {
  return getModmailConfig(guildId);
}
