import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { parseDur, fmtDur } from "../func/dur.ts";
import { lockChannel, markLocked, textChannels, logsBlock } from "../func/lock.ts";

export const data = new SlashCommandBuilder()
  .setName("raid-lockall")
  .setDescription("Lock all the text channels")
  .addStringOption((o) => o.setName("reason").setDescription("Reason of locking the channels").setRequired(false))
  .addStringOption((o) => o.setName("time").setDescription("Time to unlock the channels").setRequired(false));

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
  const timeRaw = interaction.options.getString("time");
  const dur = timeRaw ? parseDur(timeRaw) : null;
  if (timeRaw && !dur) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | Invalid time format.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const chans = textChannels(guild);
  const names: string[] = [];
  let done = 0;
  for (const ch of chans) {
    try {
      await lockChannel(ch, reason === "not-set" ? undefined : reason);
      markLocked(guild.id, ch.id);
      names.push(ch.name);
      done++;
    } catch {}
  }

  if (dur) {
    setTimeout(async () => {
      for (const ch of chans) await ch.permissionOverwrites.edit(ch.guild.id, { SendMessages: null }).catch(() => {});
    }, dur);
  }

  const time = dur ? fmtDur(dur) : "No time";
  const logs = names.length ? `\n${logsBlock(names, ":red_circle:")}` : "";
  const msg = `**${done}** channels have been locked\n\nModerator: <@${interaction.user.id}>\nReason: ${reason}\nUnlocks in: ${time}${logs}`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
