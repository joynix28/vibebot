import type { HubInteraction } from "./_hub.ts";
import { asQueueInteraction } from "./_hub.ts";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { getQueue, canControl, LOOP_LABELS } from "../func/player.ts";
import type { LoopMode } from "../func/player.ts";

export async function runLoop(interaction: HubInteraction, mode: LoopMode): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canControl(asQueueInteraction(interaction))) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser cette commande.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
    queue.setLoop(mode);
  const emoji = mode === "off" ? "➡️" : "🔁";
  await interaction.reply({
    components: [
      mode === "off"
        ? msgPanel(`${emoji} Répétition **désactivée**.`, BLUE)
        : okPanel(`${emoji} Répétition activée : **${LOOP_LABELS[mode]}**.`),
    ],
    flags: FLAGS_V2,
  });
}
