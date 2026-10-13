import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, TextChannel } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { parseDur, fmtDur } from "../func/dur.ts";
import { lockChannel, markLocked } from "../func/lock.ts";

export const data = new SlashCommandBuilder()
  .setName("raid-lock")
  .setDescription("Lock current or selected text channel")
  .addChannelOption((o) => o.setName("channel").setDescription("Channel to lock").setRequired(false))
  .addStringOption((o) => o.setName("reason").setDescription("Reason of locking this channel").setRequired(false))
  .addStringOption((o) => o.setName("time").setDescription("Time to unlock the channel").setRequired(false));

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
  const timeRaw = interaction.options.getString("time");
  const dur = timeRaw ? parseDur(timeRaw) : null;
  if (timeRaw && !dur) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | Invalid time format.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  try {
    await lockChannel(ch, reason === "not-set" ? undefined : reason);
  } catch {
    await interaction.editReply({ components: [msgPanel(":red_circle: | I couldn't lock this channel.", BLUE)], flags: FLAGS_V2 });
    return;
  }
  markLocked(guild.id, ch.id);

  if (dur) {
    setTimeout(async () => {
      await ch.permissionOverwrites.edit(ch.guild.id, { SendMessages: null }).catch(() => {});
    }, dur);
  }

  const time = dur ? fmtDur(dur) : "No time";
  const msg = `**<#${ch.id}>** has been locked\n\nModerator: <@${interaction.user.id}>\nReason: ${reason}\nUnlocks in: ${time}`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
