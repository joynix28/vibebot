import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ButtonStyle,
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
  ContainerBuilder,
  ActionRowBuilder as ARB,
  MessageActionRowComponentBuilder,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  RED,
  GOLD,
  ACCENT,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  actionRow,
  button,
  fieldRaw,
} from "../../../core/ui.ts";
import {
  createSuggestion,
  getSuggestion,
  setSuggestionMessage,
  setSuggestionStatus,
  getSuggestChannel,
  setSuggestChannel,
  setSuggestVote,
  getSuggestVotes,
} from "../func/db-gestion.ts";
import type { SuggestionRow } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("suggest")
  .setDescription("Envoie une suggestion au serveur.");

const STATUS_LABEL: Record<string, string> = { pending: "⏳ En attente", approved: "✅ Approuvée", rejected: "❌ Rejetée" };
const STATUS_COLOR: Record<string, number> = { pending: GOLD, approved: GREEN, rejected: RED };

export function buildSuggestionComponents(s: SuggestionRow, up: number, down: number): (ContainerBuilder | ARB<MessageActionRowComponentBuilder>)[] {
  const status = s.status ?? "pending";
  const head = panel(
    [
      textBlock(`## 💡 Suggestion #${s.id}\n${STATUS_LABEL[status] ?? status}`),
      sepBlock(false),
      textBlock(s.content),
      sepBlock(false),
      textBlock(`${fieldRaw("Auteur", `<@${s.author_id}>`)}\n👍 ${up} — 👎 ${down}`),
    ],
    STATUS_COLOR[status] ?? BLUE
  );
  const row = actionRow(
    button(`suggest:vote:${s.id}:up`, `Pour (${up})`, ButtonStyle.Success, "👍"),
    button(`suggest:vote:${s.id}:down`, `Contre (${down})`, ButtonStyle.Danger, "👎")
  );
  return [head, row];
}

function staffOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

function hubContainer() {
  const container = panel([textBlock("## 💡 Suggestions\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("suggest:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Publier une suggestion")
        .setValue("post")
        .setDescription("Envoie ta suggestion au serveur.")
        .setEmoji("💡"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Salon des suggestions (staff)")
        .setValue("set-channel")
        .setDescription("Définit le salon des suggestions.")
        .setEmoji("⚙️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Changer un statut (staff)")
        .setValue("statut")
        .setDescription("Approuve ou rejette une suggestion.")
        .setEmoji("✅")
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
  // Votes : suggest:vote:<id>:up|down (logique d'origine conservée).
  if (interaction.customId.startsWith("suggest:vote:")) {
    await handleVote(interaction);
    return;
  }
  if (!interaction.isStringSelectMenu() || interaction.customId !== "suggest:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "post") {
    const modal = new ModalBuilder().setCustomId("suggest:modal:post").setTitle("Publier une suggestion");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Suggestion")
        .setDescription("Décris ta suggestion.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("texte").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)
        ),
      new LabelBuilder()
        .setLabel("Salon (optionnel)")
        .setDescription("Mention ou ID. Défaut : salon configuré.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "set-channel") {
    if (!staffOnly(interaction)) {
      await interaction.update({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2 });
      return;
    }
    const modal = new ModalBuilder().setCustomId("suggest:modal:set-channel").setTitle("Salon des suggestions");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Salon")
        .setDescription("Mentionne le salon ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "statut") {
    if (!staffOnly(interaction)) {
      await interaction.update({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2 });
      return;
    }
    const modal = new ModalBuilder().setCustomId("suggest:modal:statut").setTitle("Changer le statut");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("ID de la suggestion")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("id").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
        ),
      new LabelBuilder()
        .setLabel("Nouveau statut")
        .setDescription("pending, approved ou rejected")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("statut").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
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

  if (interaction.customId === "suggest:modal:post") {
    const texte = interaction.fields.getTextInputValue("texte").trim();
    const salonRaw = interaction.fields.getTextInputValue("salon")?.trim();
    if (!texte) {
      await interaction.reply({ components: [errPanel("La suggestion est vide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const salonId = salonRaw ? salonRaw.match(/\d{17,20}/)?.[0] : null;
    const targetId = salonId ?? getSuggestChannel(guild.id) ?? interaction.channelId;
    if (!targetId) {
      await interaction.reply({ components: [errPanel("Salon de suggestions introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const target = (await guild.channels.fetch(targetId).catch(() => null)) as TextBasedChannel | null;
    if (!target?.isSendable()) {
      await interaction.reply({ components: [errPanel("Salon de suggestions introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const id = createSuggestion(guild.id, target.id, interaction.user.id, texte);
    const s = getSuggestion(id);
    if (!s) {
      await interaction.reply({ components: [errPanel("Impossible de publier la suggestion.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const sent = await target.send({ components: buildSuggestionComponents(s, 0, 0), flags: FLAGS_V2 }).catch(() => null);
    if (!sent) {
      await interaction.reply({ components: [errPanel("Impossible de publier dans ce salon.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setSuggestionMessage(id, sent.id);
    await interaction.reply({ components: [okPanel(`💡 Suggestion #${id} publiée dans <#${target.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === "suggest:modal:set-channel") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const channelId = interaction.fields.getTextInputValue("salon").match(/\d{17,20}/)?.[0];
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ components: [errPanel("Salon introuvable. Mentionne un salon textuel valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setSuggestChannel(guild.id, channel.id);
    await interaction.reply({ components: [okPanel(`Salon des suggestions : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === "suggest:modal:statut") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const id = Number(interaction.fields.getTextInputValue("id"));
    const status = interaction.fields.getTextInputValue("statut").trim().toLowerCase();
    if (!Number.isInteger(id) || id < 1 || !STATUS_LABEL[status]) {
      await interaction.reply({ components: [errPanel("ID ou statut invalide (pending, approved ou rejected).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const s = getSuggestion(id);
    if (!s || s.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel(`Aucune suggestion avec l'ID \`${id}\`.`)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setSuggestionStatus(id, status);
    await refreshSuggestionMessage(guild, { ...s, status });
    await interaction.reply({ components: [okPanel(`Suggestion #${id} : ${STATUS_LABEL[status] ?? status}.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
}

async function refreshSuggestionMessage(guild: { channels: { fetch(id: string): Promise<unknown> } }, s: SuggestionRow): Promise<void> {
  if (!s.message_id) return;
  const channel = (await guild.channels.fetch(s.channel_id).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(s.message_id).catch(() => null);
  if (!message) return;
  const { up, down } = getSuggestVotes(s.id);
  await message.edit({ components: buildSuggestionComponents(s, up, down) }).catch(() => {});
}

/** Votes sur les suggestions (logique d'origine). */
async function handleVote(interaction: MessageComponentInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const id = Number(parts[2]);
  const dir = parts[3];
  if (!Number.isInteger(id) || (dir !== "up" && dir !== "down")) return;
  const s = getSuggestion(id);
  if (!s || (interaction.guildId && s.guild_id !== interaction.guildId)) {
    await interaction.reply({ components: [errPanel("Cette suggestion n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setSuggestVote(id, interaction.user.id, dir);
  const { up, down } = getSuggestVotes(id);
  await interaction.update({ components: buildSuggestionComponents(s, up, down) });
}
