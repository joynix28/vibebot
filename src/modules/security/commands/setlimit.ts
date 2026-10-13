import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { ACTIONS } from "../func/nuke.ts";
import { setNukeAction } from "../func/db.ts";

const LIMIT_ACTIONS = [0, 1, 2, 3, 4, 5];

export const data = new SlashCommandBuilder()
  .setName("setlimit")
  .setDescription("Change the limit of an action")
  .addIntegerOption((o) =>
    o
      .setName("action")
      .setDescription("Select an action")
      .setRequired(true)
      .addChoices(...LIMIT_ACTIONS.map((v) => ({ name: ACTIONS[v]!.name, value: v })))
  )
  .addIntegerOption((o) =>
    o.setName("limit").setDescription("Number limit for the action").setRequired(true).setMinValue(0).setMaxValue(100)
  );

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

  const idx = interaction.options.getInteger("action") ?? -1;
  const action = ACTIONS[idx];
  const limit = interaction.options.getInteger("limit") ?? 0;
  if (!action) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | Invalid action.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  setNukeAction(guild.id, action.key, { limit });

  const msg = `The allowed amount of **${action.name}** has been set to **${limit}** in **10 minutes**.`;
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
