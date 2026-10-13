import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL } from "../../tempvoice/func/ui.ts";
import { errPanel, okPanel } from "../../../core/ui.ts";
import { getState, leave } from "../func/player.ts";

export const data = new SlashCommandBuilder()
  .setName("stop")
  .setDescription("⏹️ Arrête la musique et quitte le salon vocal");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      components: [errPanel("Commande utilisable uniquement sur un serveur.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const st = getState(guildId);
  if (!st || (!st.current && st.queue.length === 0)) {
    await interaction.reply({
      components: [errPanel("🔇 Rien n'est en cours de lecture.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  leave(guildId);
  await interaction.reply({
    components: [okPanel("⏹️ Lecture arrêtée, file vidée et salon vocal quitté.")],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
