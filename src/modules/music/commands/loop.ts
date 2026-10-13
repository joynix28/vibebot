import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { getQueue, canControl, LOOP_LABELS } from "../func/player.ts";
import type { LoopMode } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("loop")
  .setDescription("Change le mode de répétition (DJ uniquement).")
  .addStringOption((o) =>
    o
      .setName("mode")
      .setDescription("Mode de répétition.")
      .setRequired(true)
      .addChoices(
        { name: "Désactivée", value: "off" },
        { name: "Répéter le morceau", value: "track" },
        { name: "Répéter la file", value: "queue" }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut utiliser cette commande.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const queue = getQueue(guild.id);
  if (!queue?.nowPlaying()) {
    await interaction.reply({ components: [errPanel("⏹️ Rien n'est en cours de lecture.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const mode = interaction.options.getString("mode", true) as LoopMode;
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
