import { ButtonStyle, ContainerBuilder, ActionRowBuilder } from "discord.js";
import type {
  MessageComponentInteraction,
  MessageActionRowComponentBuilder,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  errPanel,
  msgPanel,
  actionRow,
  button,
  BLUE,
} from "../../../core/ui.ts";
import { getQueue, formatDuration, LOOP_LABELS } from "../func/player.ts";
import type { MusicQueue } from "../func/player.ts";
import type { HubInteraction } from "./_hub.ts";

const PAGE_SIZE = 10;

function queuePage(queue: MusicQueue, page: number) {
  const np = queue.nowPlaying();
  const upcoming = queue.upcoming;
  const totalPages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const slice = upcoming.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  const header = np
    ? `▶️ **En cours :** [${np.song.title}](${np.song.url}) \`[${formatDuration(np.song.duration)}]\`\n\n`
    : "";
  const body =
    slice.length > 0
      ? slice
          .map(
            (s, i) =>
              `\`${p * PAGE_SIZE + i + 1}.\` **[${s.title}](${s.url})** \`[${formatDuration(s.duration)}]\` — <@${s.requestedBy}>`
          )
          .join("\n")
      : "_File vide._";
  const footer = `\n\n📄 Page ${p + 1}/${totalPages} • ${upcoming.length} en attente • 🔁 ${LOOP_LABELS[queue.loop]} • 🔊 ${queue.volume}%`;

  const comps: (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] = [
    msgPanel(`## 🎵 File d'attente\n\n${header}${body}${footer}`, BLUE),
  ];
  if (totalPages > 1) {
    comps.push(
      actionRow(
        button(`musique:queuepage:${p - 1}`, "◀", ButtonStyle.Secondary, undefined, p === 0),
        button(`musique:queuepage:${p + 1}`, "▶", ButtonStyle.Secondary, undefined, p >= totalPages - 1)
      )
    );
  }
  return { comps, page: p };
}

export async function runQueue(interaction: HubInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2 });
    return;
  }
  const { comps } = queuePage(queue, 0);
  await interaction.reply({ components: comps, flags: FLAGS_V2 });
}

export async function handleQueuePage(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const rawPage = interaction.customId.split(":")[2];
  const page = Number(rawPage ?? "0");
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.update({ components: [errPanel("La file d'attente est vide.")], flags: FLAGS_V2 });
    return;
  }
  const { comps } = queuePage(queue, Number.isFinite(page) ? page : 0);
  await interaction.update({ components: comps, flags: FLAGS_V2 });
}
