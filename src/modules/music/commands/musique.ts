import { SlashCommandBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ContainerBuilder,
} from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  sepBlock,
  rowBlock,
  button,
  option,
  type PanelBlock,
} from "../../tempvoice/func/ui.ts";
import { errPanel } from "../../../core/ui.ts";
import {
  MUSIC_ACCENT,
  fmtDuration,
  getState,
  setPaused,
  skip,
  previous,
  goto,
  leave,
  setLoop,
  setVolume,
  shuffle,
  clearQueue,
  type LoopMode,
} from "../func/player.ts";
import { trackLine } from "../func/panels.ts";

export const data = new SlashCommandBuilder()
  .setName("musique")
  .setDescription("🎵 Panneau de contrôle de la musique");

const LOOP_LABEL: Record<LoopMode, string> = {
  off: "Désactivée",
  track: "Morceau",
  queue: "File",
};

function emptyPanel(): ContainerBuilder {
  return panel(
    [
      textBlock("## 🎵 Musique"),
      textBlock(
        "> 🔇 **Aucune lecture en cours.**\n> Utilise `/play` avec un titre ou un lien YouTube pour démarrer."
      ),
    ],
    MUSIC_ACCENT
  );
}

function stoppedPanel(): ContainerBuilder {
  return panel(
    [
      textBlock("## 🎵 Musique"),
      textBlock("> ⏹️ **Lecture arrêtée.**\n> Utilise `/play` pour relancer de la musique."),
    ],
    MUSIC_ACCENT
  );
}

/** Hub de contrôle complet, ou null si rien ne joue. */
function hubPanel(guildId: string): ContainerBuilder | null {
  const st = getState(guildId);
  if (!st || !st.current) return null;
  const t = st.current;
  const upcoming = st.queue.slice(st.index + 1, st.index + 11);
  const remaining = st.queue.length - st.index - 1;

  const blocks: PanelBlock[] = [
    textBlock("## 🎵 Musique"),
    textBlock(`### ▶️ En cours\n${trackLine(t)}`),
    rowBlock(
      button(
        "musique:pause",
        st.paused ? "Reprendre" : "Pause",
        st.paused ? ButtonStyle.Success : ButtonStyle.Secondary,
        st.paused ? "▶️" : "⏸️"
      ),
      button("musique:prev", "Précédent", ButtonStyle.Secondary, "⏮️", st.index <= 0),
      button("musique:skip", "Suivant", ButtonStyle.Secondary, "⏭️"),
      button("musique:stop", "Stop", ButtonStyle.Danger, "⏹️")
    ),
    sepBlock(),
    textBlock(`### 📋 File d'attente (${remaining} à venir)`),
  ];

  if (upcoming.length > 0) {
    blocks.push(
      textBlock(
        upcoming
          .map(
            (x, i) =>
              `**${st.index + 2 + i}.** [${x.title}](${x.url}) • \`${fmtDuration(x.durationSec)}\``
          )
          .join("\n")
      )
    );
    const menu = new StringSelectMenuBuilder()
      .setCustomId("musique:goto")
      .setPlaceholder("Aller directement à un morceau…")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        upcoming.map((x, i) => {
          const idx = st.index + 1 + i;
          return option(`${idx + 1}. ${x.title}`.slice(0, 100), String(idx), {
            description: fmtDuration(x.durationSec),
            emoji: "🎵",
          });
        })
      );
    blocks.push(rowBlock(menu));
  } else {
    blocks.push(textBlock("> La file est vide — ajoute des morceaux avec `/play`."));
  }

  blocks.push(sepBlock());
  blocks.push(textBlock(`### 🔁 Boucle : **${LOOP_LABEL[st.loop]}**`));
  blocks.push(
    rowBlock(
      button(
        "musique:loop:off",
        "Off",
        st.loop === "off" ? ButtonStyle.Primary : ButtonStyle.Secondary,
        "➡️"
      ),
      button(
        "musique:loop:track",
        "Morceau",
        st.loop === "track" ? ButtonStyle.Primary : ButtonStyle.Secondary,
        "🔂"
      ),
      button(
        "musique:loop:queue",
        "File",
        st.loop === "queue" ? ButtonStyle.Primary : ButtonStyle.Secondary,
        "🔁"
      )
    )
  );
  blocks.push(textBlock(`### 🔊 Volume : **${st.volume}%**`));
  blocks.push(
    rowBlock(
      button("musique:vol:down", "-10", ButtonStyle.Secondary, "🔉"),
      button("musique:vol:up", "+10", ButtonStyle.Secondary, "🔊")
    )
  );
  blocks.push(sepBlock());
  blocks.push(
    rowBlock(
      button("musique:shuffle", "Mélanger", ButtonStyle.Secondary, "🔀"),
      button("musique:clear", "Vider la file", ButtonStyle.Danger, "🗑️")
    )
  );
  return panel(blocks, MUSIC_ACCENT);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      components: [errPanel("Commande utilisable uniquement sur un serveur.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [hubPanel(guildId) ?? emptyPanel()],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const guildId = guild.id;
  const id = interaction.customId;

  // Affichage détaillé de la file (depuis les boutons de /play).
  if (id === "musique:queue") {
    const st = getState(guildId);
    const c =
      st?.current != null
        ? panel(
            [
              textBlock("## 📋 File d'attente"),
              textBlock(`**En cours :** ${trackLine(st.current)}`),
              textBlock(
                st.queue.length > st.index + 1
                  ? st.queue
                      .slice(st.index + 1, st.index + 11)
                      .map(
                        (t, i) =>
                          `**${st.index + 2 + i}.** [${t.title}](${t.url}) • \`${fmtDuration(
                            t.durationSec
                          )}\``
                      )
                      .join("\n")
                  : "> Rien d'autre dans la file."
              ),
            ],
            MUSIC_ACCENT
          )
        : emptyPanel();
    await interaction.reply({ components: [c], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  await interaction.deferUpdate();

  if (id === "musique:pause") {
    const st = getState(guildId);
    if (st?.current) setPaused(guildId, !st.paused);
  } else if (id === "musique:prev") {
    await previous(guildId);
  } else if (id === "musique:skip") {
    await skip(guildId);
  } else if (id === "musique:stop") {
    leave(guildId);
    await interaction.editReply({ components: [stoppedPanel()] });
    return;
  } else if (id === "musique:goto" && interaction.isStringSelectMenu()) {
    const idx = Number.parseInt(interaction.values[0] ?? "", 10);
    if (Number.isFinite(idx)) await goto(guildId, idx);
  } else if (id.startsWith("musique:loop:")) {
    const mode = id.split(":")[2];
    if (mode === "off" || mode === "track" || mode === "queue") setLoop(guildId, mode);
  } else if (id === "musique:vol:down" || id === "musique:vol:up") {
    const st = getState(guildId);
    if (st) setVolume(guildId, st.volume + (id === "musique:vol:up" ? 10 : -10));
  } else if (id === "musique:shuffle") {
    shuffle(guildId);
  } else if (id === "musique:clear") {
    clearQueue(guildId);
  }

  await interaction.editReply({ components: [hubPanel(guildId) ?? emptyPanel()] });
}
