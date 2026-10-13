import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { msgPanel, FLAGS_V2, BLUE } from "../../ui.ts";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Affiche la latence du bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({
    components: [msgPanel("🏓 Pong !", BLUE)],
    flags: FLAGS_V2,
    withResponse: true,
  });
  const msg = sent.resource?.message;
  const latency = msg ? msg.createdTimestamp - interaction.createdTimestamp : 0;
  const ws = Math.round(interaction.client.ws.ping);
  await interaction.editReply({
    components: [msgPanel(`🏓 Pong !\n> **Latence :** \`${latency}ms\`\n> **WebSocket :** \`${ws}ms\``, BLUE)],
    flags: FLAGS_V2,
  });
}
