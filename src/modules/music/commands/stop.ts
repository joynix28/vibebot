import type { HubInteraction } from "./_hub.ts";
import { asQueueInteraction } from "./_hub.ts";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { leave, canControl } from "../func/player.ts";

export async function runStop(interaction: HubInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canControl(asQueueInteraction(interaction))) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser cette commande.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!leave(guild.id)) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [okPanel("⏹️ Lecture arrêtée, file effacée. À bientôt ! 👋")], flags: FLAGS_V2 });
}
