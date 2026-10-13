import { SlashCommandBuilder, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { FLAGS_V2_EPHEMERAL, panel, textBlock } from "../func/ui.ts";
import { isTemp, TV_ACCENT } from "../func/voice.ts";
import { getState } from "../func/voiceState.ts";

export const data = new SlashCommandBuilder()
  .setName("join")
  .setDescription("Join a temporary channel by using a password")
  .addStringOption((o) => o.setName("password").setDescription("The channel password").setRequired(true));

function attention(interaction: ChatInputCommandInteraction, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)], TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

function success(interaction: ChatInputCommandInteraction, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)])], flags: FLAGS_V2_EPHEMERAL });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const guild = interaction.guild;
  if (!member || !guild) {
    await attention(interaction, "Attention!", "This command must be used in a server.");
    return;
  }

  const password = interaction.options.getString("password", true);
  const target = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildVoice && isTemp(c.id))
    .find((c) => getState(c.id)?.password === password);

  if (!target) {
    await attention(interaction, "Wrong Password!", "There is no temporary channel with this password.");
    return;
  }

  if (!member.voice.channelId) {
    await attention(interaction, "Attention!", "You must be in a voice channel to join.");
    return;
  }

  try {
    await member.voice.setChannel(target.id);
    await success(interaction, "Joined!", `You joined <#${target.id}>.`);
  } catch {
    await attention(interaction, "Attention!", "You cannot join this temporary channel.");
  }
}