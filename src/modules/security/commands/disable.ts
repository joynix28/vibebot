import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ACTIONS, actionChoices } from "../func/nuke.ts";
import { setNukeAction } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("disable")
  .setDescription("Disable an anti nuke action")
  .addIntegerOption((o) =>
    o.setName("action").setDescription("Select an action").setRequired(true).addChoices(...actionChoices)
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

  const idx = interaction.options.getInteger("action") ?? -1;
  const action = ACTIONS[idx];
  if (!action) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | Invalid action.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  setNukeAction(guild.id, action.key, { enabled: false });

  const msg = `:red_circle: **${action.name}** wont result in a punishment anymore.`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}
