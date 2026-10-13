import {
  SlashCommandBuilder,
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
} from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, ACCENT, okPanel, errPanel, panel, textBlock } from "../../../core/ui.ts";
import { setAfk, removeAfk, getAfk } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("afk")
  .setDescription("Signale que tu es absent (AFK).");

function hubContainer() {
  const container = panel([textBlock("## 💤 AFK\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("afk:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Passer en AFK")
        .setValue("set")
        .setDescription("Signale ton absence avec une raison.")
        .setEmoji("💤"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Retirer l'AFK")
        .setValue("remove")
        .setDescription("Signale ton retour.")
        .setEmoji("👋")
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
  if (!interaction.isStringSelectMenu() || interaction.customId !== "afk:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "set") {
    const modal = new ModalBuilder().setCustomId("afk:modal:set").setTitle("Passer en AFK");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Raison")
        .setDescription("Pourquoi es-tu absent ? (optionnel)")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("raison")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200)
            .setPlaceholder("Ex : en cours…")
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "remove") {
    const removed = removeAfk(guild.id, interaction.user.id);
    await interaction.update({
      components: [removed ? okPanel("👋 Tu n'es plus AFK. Bon retour !") : errPanel("Tu n'es pas AFK.")],
      flags: FLAGS_V2,
    });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "afk:modal:set") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const reason = interaction.fields.getTextInputValue("raison")?.trim() || "AFK";
  setAfk(guild.id, interaction.user.id, reason);
  await interaction.reply({ components: [okPanel(`💤 Tu es maintenant AFK : *${reason}*`)], flags: FLAGS_V2_EPHEMERAL });
}

/** Utilisé par l'event messageCreate (exporté pour les tests / futurs usages). */
export function currentAfk(guildId: string, userId: string) {
  return getAfk(guildId, userId);
}
