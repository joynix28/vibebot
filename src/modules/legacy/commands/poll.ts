import { SlashCommandBuilder, ButtonStyle } from "discord.js";
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
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  actionRow,
  button,
} from "../../../core/ui.ts";
import { createPoll, getPoll, setPollMessage, savePollOptions, closePoll } from "../func/db-gestion.ts";
import type { PollRow, PollOption } from "../func/db-gestion.ts";
import { parseDuration } from "../func/dur.ts";

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Crée un sondage avec des boutons de vote.")
  .addStringOption((o) => o.setName("question").setDescription("La question du sondage.").setRequired(true).setMaxLength(300))
  .addStringOption((o) =>
    o.setName("options").setDescription("Options séparées par | ou ; (2 à 10).").setRequired(true).setMaxLength(1000)
  )
  .addStringOption((o) => o.setName("duree").setDescription("Durée avant clôture auto : 30m, 1h, 1d… (optionnel).").setMaxLength(10));

function totalVotes(options: PollOption[]): number {
  return options.reduce((n, o) => n + o.votes.length, 0);
}

function formatResults(options: PollOption[]): string {
  const total = totalVotes(options);
  return options
    .map((o, i) => {
      const n = o.votes.length;
      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      return `\`${i + 1}.\` **${o.label}** — ${n} vote(s) (${pct}%)\n${bar}`;
    })
    .join("\n");
}

/** Construit les composants du message de sondage (panneau + boutons de vote). */
export function buildPollComponents(poll: PollRow, closed: boolean): (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] {
  const ends = poll.ends_at ? `\n*${closed ? "Clôturé" : `Se termine`} <t:${Math.floor(poll.ends_at / 1000)}:R>*` : "";
  const head = panel(
    [
      textBlock(`## 📊 ${poll.question}${ends}`),
      sepBlock(false),
      textBlock(formatResults(poll.options)),
      textBlock(`*${totalVotes(poll.options)} vote(s) au total*`),
    ],
    closed ? BLUE : GOLD
  );
  if (closed) return [head];
  const rows: ActionRowBuilder<MessageActionRowComponentBuilder>[] = [];
  let current: ReturnType<typeof button>[] = [];
  poll.options.forEach((o, i) => {
    current.push(button(`poll:vote:${poll.id}:${i}`, `${i + 1}. ${o.label.slice(0, 75)}`, ButtonStyle.Primary));
    if (current.length === 5) {
      rows.push(actionRow(...(current.splice(0) as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
    }
  });
  if (current.length > 0) {
    rows.push(actionRow(...(current as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
  }
  return [head, ...rows];
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const question = interaction.options.getString("question", true);
  const rawOptions = interaction.options.getString("options", true);
  const labels = rawOptions.split(/[|;]/).map((s) => s.trim()).filter(Boolean);
  if (labels.length < 2 || labels.length > 10) {
    await interaction.reply({ components: [errPanel("Donne entre 2 et 10 options, séparées par `|` ou `;`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  let endsAt: number | null = null;
  const rawDur = interaction.options.getString("duree");
  if (rawDur) {
    const parsed = parseDuration(rawDur);
    if (!parsed) {
      await interaction.reply({ components: [errPanel("Durée invalide. Exemples : `30m`, `1h`, `2d`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    endsAt = Date.now() + parsed.ms;
  }

  const pollId = createPoll(guild.id, channel.id, question, labels, endsAt, interaction.user.id);
  const poll = getPoll(pollId);
  if (!poll) {
    await interaction.reply({ components: [errPanel("Impossible de créer le sondage.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const postChannel = channel as TextBasedChannel;
  if (!postChannel.isSendable()) {
    closePoll(pollId);
    await interaction.reply({ components: [errPanel("Impossible de publier le sondage.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sent = await postChannel
    .send({ components: buildPollComponents(poll, false), flags: FLAGS_V2 })
    .catch(() => null);
  if (!sent) {
    closePoll(pollId);
    await interaction.reply({ components: [errPanel("Impossible de publier le sondage.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setPollMessage(pollId, sent.id);
  await interaction.reply({ components: [okPanel(`📊 Sondage #${pollId} créé.`), ], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  // poll:vote:<id>:<idx>
  const parts = interaction.customId.split(":");
  const pollId = Number(parts[2]);
  const idx = Number(parts[3]);
  if (!Number.isInteger(pollId) || !Number.isInteger(idx)) return;
  const poll = getPoll(pollId);
  if (!poll || poll.closed !== 0) {
    await interaction.reply({ components: [errPanel("Ce sondage est terminé.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (poll.ends_at && poll.ends_at <= Date.now()) {
    closePoll(poll.id);
    await interaction.reply({ components: [errPanel("Ce sondage est terminé.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const option = poll.options[idx];
  if (!option) return;
  const voter = interaction.user.id;
  for (const o of poll.options) {
    o.votes = o.votes.filter((v) => v !== voter);
  }
  option.votes.push(voter);
  savePollOptions(pollId, poll.options);
  await interaction.update({ components: buildPollComponents({ ...poll, options: poll.options }, false) });
}

/** Clôture un sondage arrivé à échéance : verrouille les votes et édite le message. */
export async function closeExpiredPoll(guild: { channels: { fetch(id: string): Promise<unknown> } }, poll: PollRow): Promise<void> {
  closePoll(poll.id);
  if (!poll.message_id) return;
  const channel = (await guild.channels.fetch(poll.channel_id).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(poll.message_id).catch(() => null);
  if (!message) return;
  await message.edit({ components: buildPollComponents(poll, true) }).catch(() => {});
}
