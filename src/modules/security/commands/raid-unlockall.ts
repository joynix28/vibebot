import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { unlockChannel, textChannels, logsBlock } from "../func/lock.ts";

export const data = new SlashCommandBuilder()
  .setName("raid-unlockall")
  .setDescription("Unlock all the locked text channels")
  .addStringOption((o) => o.setName("reason").setDescription("Reason of unlocking the channels").setRequired(false));

const BLUE = 0x297fb9;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const isOwner = guild.ownerId === interaction.user.id;
  const perms = (interaction.member as any)?.permissions;

  await interaction.deferReply({ flags: FLAGS_V2 });

  if (!isOwner && !perms?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | You don't have permission to use this command.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const reason = interaction.options.getString("reason") || "not-set";
  const chans = textChannels(guild);
  const names: string[] = [];
  let done = 0;
  for (const ch of chans) {
    try {
      await unlockChannel(ch, reason === "not-set" ? undefined : reason);
      names.push(ch.name);
      done++;
    } catch {}
  }

  const logs = names.length ? `\n${logsBlock(names, ":green_circle:")}` : "";
  const msg = `**${done}** channels have been unlocked\n\nModerator: <@${interaction.user.id}>\nReason: ${reason}${logs}`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
