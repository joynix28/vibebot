import {SlashCommandBuilder} from 'discord.js';
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL, panel, type PanelBlock, textBlock } from "../func/ui.ts";
import { isTemp } from "../func/voice.ts";

export const data = new SlashCommandBuilder()
  .setName("voice-find")
  .setDescription("Find out which voice channel a user is in")
  .addUserOption((o) => o.setName("user").setDescription("Select a user").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("user", true);
  const guild = interaction.guild;
  const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
  const channel = member?.voice.channel;

  const blocks: PanelBlock[] = channel && isTemp(channel.id)
    ? [
        textBlock(
          `## **Found!**\nThe user <@${user.id}> you're looking for is here: <#${channel.id}>`
      ),
      ]
    : [
        textBlock(
          "## **Not Found.**\nThe user you're looking for isn't in a public temporary voice channel.\n- They might be in a voice channel that wasn't created by TempVoice.\n- The temporary voice channel might be invisible, or you don't have permission to connect."
        ),
    ];

  await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
}