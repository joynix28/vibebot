import type { HubInteraction } from "./_hub.ts";
import { asQueueInteraction } from "./_hub.ts";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";
import { getSettings } from "../func/db.ts";

export async function runVolume(interaction: HubInteraction, level: number | null): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);

  if (level === null) {
    const v = queue ? queue.volume : getSettings(guild.id).default_volume;
    await interaction.reply({ components: [msgPanel(`🔊 Volume actuel : **${v}%**`, BLUE)], flags: FLAGS_V2 });
    return;
  }

  if (!canControl(asQueueInteraction(interaction))) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut régler le volume.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (queue) queue.setVolume(level);
  await interaction.reply({ components: [okPanel(`🔊 Volume réglé à **${level}%**.`)], flags: FLAGS_V2 });
}
