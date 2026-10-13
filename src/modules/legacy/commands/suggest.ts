import { SlashCommandBuilder, PermissionFlagsBits, ButtonStyle, ChannelType } from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  TextBasedChannel,
  ContainerBuilder,
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
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
  .setDescription("Envoie une suggestion au serveur.")
  .addSubcommand((s) =>
    s
      .setName("post")
      .setDescription("Publie une suggestion.")
      .addStringOption((o) => o.setName("texte").setDescription("Le contenu de la suggestion.").setRequired(true).setMaxLength(1500))
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon de publication (défaut : celui configuré).").addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("set-channel")
      .setDescription("Définit le salon des suggestions (staff).")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon des suggestions.").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("statut")
      .setDescription("Change le statut d'une suggestion (staff).")
      .addIntegerOption((o) => o.setName("id").setDescription("ID de la suggestion.").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("statut")
          .setDescription("Nouveau statut.")
          .setRequired(true)
          .addChoices(
            { name: "En attente", value: "pending" },
            { name: "Approuvée", value: "approved" },
            { name: "Rejetée", value: "rejected" }
          )
      )
  );

const STATUS_LABEL: Record<string, string> = { pending: "⏳ En attente", approved: "✅ Approuvée", rejected: "❌ Rejetée" };
const STATUS_COLOR: Record<string, number> = { pending: GOLD, approved: GREEN, rejected: RED };

export function buildSuggestionComponents(s: SuggestionRow, up: number, down: number): (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] {
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

function staffOnly(interaction: ChatInputCommandInteraction): boolean {
  return !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "set-channel") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const channel = interaction.options.getChannel("salon", true);
    setSuggestChannel(guild.id, channel.id);
    await interaction.reply({ components: [okPanel(`Salon des suggestions : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (sub === "statut") {
    if (!staffOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const id = interaction.options.getInteger("id", true);
    const status = interaction.options.getString("statut", true);
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

  // post
  const texte = interaction.options.getString("texte", true);
  const optChannel = interaction.options.getChannel("salon");
  const targetId = optChannel?.id ?? getSuggestChannel(guild.id) ?? interaction.channelId;
  const target = (await guild.channels.fetch(targetId).catch(() => null)) as TextBasedChannel | null;
  if (!target?.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon de suggestions introuvable. Un membre du staff doit configurer `/suggest set-channel`.")], flags: FLAGS_V2_EPHEMERAL });
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

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  // suggest:vote:<id>:up|down
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
