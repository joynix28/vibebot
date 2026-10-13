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
  RED,
  ACCENT,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { createReport, listOpenReports } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Signale un membre au staff.");

function hubContainer() {
  const container = panel([textBlock("## 🚨 Signalement\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("report:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Signaler un membre")
        .setValue("send")
        .setDescription("Envoie un signalement au staff.")
        .setEmoji("🚨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir les signalements (staff)")
        .setValue("list")
        .setDescription("Liste les signalements ouverts.")
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
  if (!interaction.isStringSelectMenu() || interaction.customId !== "report:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "send") {
    const modal = new ModalBuilder().setCustomId("report:modal:send").setTitle("Signaler un membre");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Membre")
        .setDescription("Mentionne le membre ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("membre").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        ),
      new LabelBuilder()
        .setLabel("Raison")
        .setDescription("Décris le problème.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("raison").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)
        ),
      new LabelBuilder()
        .setLabel("Salon (optionnel)")
        .setDescription("Mention ou ID du salon de modération. Défaut : salon actuel.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "list") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.update({ components: [errPanel("Réservé au staff.")], flags: FLAGS_V2 });
      return;
    }
    const reports = listOpenReports(guild.id);
    if (reports.length === 0) {
      await interaction.update({ components: [okPanel("Aucun signalement ouvert. 🎉")], flags: FLAGS_V2 });
      return;
    }
    const lines = reports
      .map((r) => `\`#${r.id}\` — <@${r.target_id}> signalé par <@${r.reporter_id}>\n> ${r.reason.slice(0, 200)}`)
      .join("\n");
    await interaction.update({ components: [panel([textBlock(`## 🚨 Signalements ouverts\n${lines}`)], RED)], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "report:modal:send") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const targetId = interaction.fields.getTextInputValue("membre").match(/\d{17,20}/)?.[0];
  const reason = interaction.fields.getTextInputValue("raison").trim();
  const salonRaw = interaction.fields.getTextInputValue("salon")?.trim();

  if (!targetId) {
    await interaction.reply({ components: [errPanel("Membre introuvable. Mentionne un membre valide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const target = await interaction.client.users.fetch(targetId).catch(() => null);
  if (!target) {
    await interaction.reply({ components: [errPanel("Membre introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.id === interaction.user.id) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas te signaler toi-même.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.bot) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas signaler un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!reason) {
    await interaction.reply({ components: [errPanel("La raison est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const optChannelId = salonRaw ? salonRaw.match(/\d{17,20}/)?.[0] : null;
  const targetChannelId = optChannelId ?? interaction.channelId;
  if (!targetChannelId) {
    await interaction.reply({ components: [errPanel("Salon introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const targetChannel = (await guild.channels.fetch(targetChannelId).catch(() => null)) as TextBasedChannel | null;
  if (!targetChannel?.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = createReport(guild.id, interaction.user.id, target.id, reason);
  const sent = await targetChannel
    .send({
      components: [
        panel(
          [
            textBlock(`## 🚨 Signalement #${id}`),
            sepBlock(false),
            textBlock(`${fieldRaw("Membre signalé", `${target} (\`${target.tag} | ${target.id}\`)`)}\n${fieldRaw("Signalé par", `<@${interaction.user.id}>`)}\n${fieldRaw("Raison", reason)}`),
          ],
          RED
        ),
      ],
      flags: FLAGS_V2,
    })
    .catch(() => null);
  if (!sent) {
    await interaction.reply({ components: [errPanel("Impossible d'envoyer le signalement dans ce salon.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [okPanel(`🚨 Signalement #${id} envoyé. Merci, le staff va s'en occuper.`)], flags: FLAGS_V2_EPHEMERAL });
}
