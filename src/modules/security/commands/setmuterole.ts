import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { ensureGuild, saveGuild } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("setmuterole")
  .setDescription("Create a new mute role or set an existing one")
  .addRoleOption((o) => o.setName("role").setDescription("Role to set, empty to create a new one").setRequired(false));

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

  const selected = interaction.options.getRole("role");
  let role = selected;
  if (!role) {
    role = await guild.roles.create({ name: "Muted", permissions: [], reason: "Security - mute role" }).catch(() => null);
  }
  if (!role) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | I couldn't create the mute role.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const cfg = ensureGuild(guild.id);
  cfg.mute_role = role.id;
  saveGuild(cfg);

  const msg = "Mute role has been successfully set, **make sure to move it above your normal roles in order to work**.";
  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
