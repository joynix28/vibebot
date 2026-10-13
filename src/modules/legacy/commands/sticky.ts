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
  Guild,
  TextBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  ACCENT,
  okPanel,
  errPanel,
  msgPanel,
  panel,
  textBlock,
} from "../../../core/ui.ts";
import { setSticky, getSticky, removeSticky, setStickyLastId } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("sticky")
  .setDescription("Garde un message « collant » en bas du salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

/** Publie (ou republie) le sticky d'un salon et mémorise son id. */
export async function postSticky(guild: Guild, channelId: string, text: string): Promise<string | null> {
  const channel = (await guild.channels.fetch(channelId).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isSendable()) return null;
  const sent = await channel.send({ components: [msgPanel(text, BLUE)], flags: FLAGS_V2 }).catch(() => null);
  if (!sent) return null;
  setStickyLastId(guild.id, channelId, sent.id);
  return sent.id;
}

function hubContainer() {
  const container = panel([textBlock("## 📌 Message collant\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("sticky:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Définir le message collant")
        .setValue("set")
        .setDescription("Il restera en bas du salon actuel.")
        .setEmoji("📌"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Retirer le message collant")
        .setValue("remove")
        .setDescription("Retire le collant du salon actuel.")
        .setEmoji("🗑️")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.channel;
  if (!interaction.guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "sticky:menu") return;
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "set") {
    const modal = new ModalBuilder().setCustomId("sticky:modal:set").setTitle("Message collant");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Message")
        .setDescription("Le texte qui restera en bas du salon.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("message").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "remove") {
    const existing = getSticky(guild.id, channel.id);
    if (!existing) {
      await interaction.update({ components: [errPanel("Aucun message collant dans ce salon.")], flags: FLAGS_V2 });
      return;
    }
    if (existing.last_id) {
      await channel.messages.delete(existing.last_id).catch(() => {});
    }
    removeSticky(guild.id, channel.id);
    await interaction.update({ components: [okPanel("Message collant retiré.")], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "sticky:modal:set") return;
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const message = interaction.fields.getTextInputValue("message").trim();
  if (!message) {
    await interaction.reply({ components: [errPanel("Le message est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const existing = getSticky(guild.id, channel.id);
  if (existing?.last_id) {
    await channel.messages.delete(existing.last_id).catch(() => {});
  }
  const sentId = await postSticky(guild, channel.id, message);
  if (!sentId) {
    await interaction.reply({ components: [errPanel("Impossible de publier le message collant.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setSticky(guild.id, channel.id, message, sentId);
  await interaction.reply({ components: [okPanel("📌 Message collant défini : il restera en bas du salon.")], flags: FLAGS_V2_EPHEMERAL });
}
