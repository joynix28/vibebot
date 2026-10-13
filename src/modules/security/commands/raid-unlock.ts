import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { unlockChannel, unmarkLocked } from "../func/lock.ts";

export const data = new SlashCommandBuilder()
  .setName("raid-unlock")
  .setDescription("Unlock current or selected text channel")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel to unlock").setRequired(false))
  .addStringOption((o) => o.setName("reason").setDescription("Reason of unlocking this channel").setRequired(false));

const BLUE = 0x297fb9;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const isOwner = guild.ownerId === interaction.user.id;
  const perms = (interaction.member as any)?.permissions;
  if (!isOwner && !perms?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ components: [msgPanel(":red_circle: | You don't have permission to use this command.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const ch = (interaction.options.getChannel("channel") ?? interaction.channel) as TextChannel;
  if (!ch?.isTextBased?.()) {
    await interaction.reply({ components: [msgPanel(":red_circle: | Please select a text channel.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  await interaction.deferReply({ flags: FLAGS_V2 });

  const reason = interaction.options.getString("reason") || "not-set";
  try {
    await unlockChannel(ch, reason === "not-set" ? undefined : reason);
  } catch {
    await interaction.editReply({ components: [msgPanel(":red_circle: | I couldn't unlock this channel.", BLUE)], flags: FLAGS_V2 });
    return;
  }
  unmarkLocked(guild.id, ch.id);

  const msg = `**<#${ch.id}>** has been unlocked\n\nModerator: <@${interaction.user.id}>\nReason: ${reason}`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
