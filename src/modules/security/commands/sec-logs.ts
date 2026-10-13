import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, saveGuild } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("sec-logs")
  .setDescription("Creates a log channel")
  .addSubcommand((s) =>
    s
      .setName("security")
      .setDescription("Log channel for security actions")
      .addChannelOption((o) => o.setName("channel").setDescription("Select a channel to set or empty to create a new one").setRequired(false).addChannelTypes(ChannelType.GuildText))
  )
  .addSubcommand((s) =>
    s
      .setName("mod")
      .setDescription("Log channel for moderation commands")
      .addChannelOption((o) => o.setName("channel").setDescription("Select a channel to set or empty to create a new one").setRequired(false).addChannelTypes(ChannelType.GuildText))
  );

const BLUE = 0x297fb9;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const isOwner = guild.ownerId === interaction.user.id;
  const perms = (interaction.member as any)?.permissions;
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
  if (!isOwner && !perms?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | You don't have permission to use this command.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const selected = interaction.options.getChannel("channel");

  let ch = selected;
  if (!ch) {
    ch = await guild.channels
      .create({ name: sub === "mod" ? "mod-logs" : "security-logs", type: ChannelType.GuildText, reason: "Security - log setup" })
      .catch(() => null);
  }
  if (!ch) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | I couldn't create the log channel.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const cfg = ensureGuild(guild.id);
  if (sub === "mod") cfg.mod_log = ch.id;
  else cfg.security_log = ch.id;
  saveGuild(cfg);

  const msg =
    sub === "mod"
      ? "Mod logs channel has been created successfully.\n`Note: Mod logs can only log security's moderation commands usages`"
      : "Security logs channel has been created successfully.";

  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}
