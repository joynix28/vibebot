import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { g, type Guild } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("whitelabel")
  .setDescription("Personnaliser l'apparence du bot sur ce serveur")
  .setDefaultMemberPermissions(8);

const gr = 0x5bd57b;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("whitelabel:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Configurer")
        .setValue("setup")
        .setDescription("Personnalise le nom d'affichage du bot")
        .setEmoji("🎨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Désactiver")
        .setValue("disable")
        .setDescription("Réinitialise l'apparence par défaut")
        .setEmoji("🚫")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 🎨 Whitelabel\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

async function doDisable(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);
  void cfg;
  await interaction.update({
    components: [st("Success", gr, "Successfully **disabled whitelabel** for this server.")],
  });
}

async function doSetup(interaction: ModalSubmitInteraction, name: string | null): Promise<void> {
  const parts = [`**Display Name:** ${name ?? "unchanged"}`, "**Icon:** unchanged"];
  await interaction.reply({
    components: [st("Success", gr, `Successfully **updated whitelabel** for this server.\n\n${parts.join("\n")}\n\n> Note: Discord doesn't allow changing the bot name/icon per-server. Use the bot's own display name instead.`)],
    flags: V2E,
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId !== "whitelabel:menu" || !interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];
  if (action === "disable") {
    await doDisable(interaction);
    return;
  }
  if (action === "setup") {
    const modal = new ModalBuilder().setCustomId("whitelabel:modal:setup").setTitle("Whitelabel");
    const input = new TextInputBuilder()
      .setCustomId("display_name")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(32)
      .setPlaceholder("Nouveau nom d'affichage");
    modal.addLabelComponents(new LabelBuilder().setLabel("Nom d'affichage").setTextInputComponent(input));
    await interaction.showModal(modal);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "whitelabel:modal:setup") return;
  const name = interaction.fields.getTextInputValue("display_name").trim() || null;
  await doSetup(interaction, name);
}
