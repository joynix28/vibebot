import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  errPanel,
  actionRow,
  button,
} from "../../../core/ui.ts";
import {
  getQueue,
  canControl,
  nowPlayingPanel,
  listenerCount,
  votesNeeded,
  type LoopMode,
} from "../func/player.ts";
import { getSettings } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("nowplaying")
  .setDescription("Affiche le morceau en cours avec barre de progression et contrôles.");

function controlsRow() {
  return actionRow(
    button("nowplaying:pause", "", ButtonStyle.Secondary, "⏸️"),
    button("nowplaying:skip", "", ButtonStyle.Secondary, "⏭️"),
    button("nowplaying:stop", "", ButtonStyle.Danger, "⏹️"),
    button("nowplaying:loop", "", ButtonStyle.Secondary, "🔁")
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
  await interaction.reply({ components: [nowPlayingPanel(queue), controlsRow()], flags: FLAGS_V2 });
}

const LOOPS: LoopMode[] = ["off", "track", "queue"];

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.update({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2 });
    return;
  }
  const action = interaction.customId.split(":")[1];

  if (action === "skip") {
    if (canControl(interaction)) {
      queue.skip();
      await interaction.update({ components: [nowPlayingPanel(queue), controlsRow()], flags: FLAGS_V2 });
      return;
    }
    // Vote de skip
    if (queue.hasVoted(interaction.user.id)) {
      await interaction.reply({ components: [errPanel("Tu as déjà voté pour passer ce morceau.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const votes = queue.addVote(interaction.user.id);
    const needed = votesNeeded(listenerCount(guild, queue.voiceChannelId), getSettings(guild.id).skip_percent);
    if (votes >= needed) {
      queue.skip();
      await interaction.update({ components: [nowPlayingPanel(queue), controlsRow()], flags: FLAGS_V2 });
    } else {
      await interaction.reply({
        components: [errPanel(`🗳️ Vote enregistré (${votes}/${needed}).`)],
        flags: FLAGS_V2_EPHEMERAL,
      });
    }
    return;
  }

  if (!canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser ces contrôles.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action === "pause") {
    if (queue.paused) queue.resume();
    else queue.pause();
  } else if (action === "stop") {
    queue.destroy("arrêt via nowplaying");
    await interaction.update({ components: [errPanel("⏹️ Lecture arrêtée, file effacée.")], flags: FLAGS_V2 });
    return;
  } else if (action === "loop") {
    const next = LOOPS[(LOOPS.indexOf(queue.loop) + 1) % LOOPS.length] ?? "off";
    queue.setLoop(next);
  }
  await interaction.update({ components: [nowPlayingPanel(queue), controlsRow()], flags: FLAGS_V2 });
}
