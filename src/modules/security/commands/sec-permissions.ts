import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { permChoices, permName } from "../func/perm.ts";
import { addPerm, removePerm, resetPerms, getPerms, usersWithPerm } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("sec-permissions")
  .setDescription("Manage who can access the moderation commands")
  .addSubcommand((s) =>
    s.setName("view_user").setDescription("Get granted permissions of a user").addUserOption((o) => o.setName("user").setDescription("User to check").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Add some permission to a user")
      .addUserOption((o) => o.setName("user").setDescription("User to get the permission").setRequired(true))
      .addIntegerOption((o) => o.setName("sec-permissions").setDescription("Permission to add").setRequired(true).addChoices(...permChoices))
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Remove some permission from a user")
      .addUserOption((o) => o.setName("user").setDescription("User to remove the permission from").setRequired(true))
      .addIntegerOption((o) => o.setName("sec-permissions").setDescription("Permission to remove").setRequired(true).addChoices(...permChoices))
  )
  .addSubcommand((s) =>
    s
      .setName("view_permission")
      .setDescription("Get users with the selected permission")
      .addIntegerOption((o) => o.setName("sec-permissions").setDescription("Permission to check").setRequired(true).addChoices(...permChoices))
  )
  .addSubcommand((s) =>
    s.setName("reset").setDescription("Remove all the permissions from a user").addUserOption((o) => o.setName("user").setDescription("User to remove the permissions from").setRequired(true))
  )
  .addSubcommand((s) =>
    s.setName("reset_id").setDescription("Remove all the permissions from a user using their id").addStringOption((o) => o.setName("user_id").setDescription("User to remove the permissions from").setRequired(true))
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

  const sub = interaction.options.getSubcommand();
  let msg = "";

  if (sub === "view_user") {
    const user = interaction.options.getUser("user")!;
    const list = getPerms(guild.id, user.id);
    msg = list.length
      ? `**${user.username}** has these permissions:\n${list.map((p) => `- ${permName(p)}`).join("\n")}`
      : `**${user.username}** doesn't have any permissions granted.`;
  } else if (sub === "add") {
    const user = interaction.options.getUser("user")!;
    const p = interaction.options.getInteger("permission")!;
    addPerm(guild.id, user.id, p);
    msg = `The **${permName(p)}** permission has been granted to **${user.username}**.`;
  } else if (sub === "remove") {
    const user = interaction.options.getUser("user")!;
    const p = interaction.options.getInteger("permission")!;
    removePerm(guild.id, user.id, p);
    msg = `The **${permName(p)}** permission has been removed from **${user.username}**.`;
  } else if (sub === "view_permission") {
    const p = interaction.options.getInteger("permission")!;
    const ids = usersWithPerm(guild.id, p);
    msg = ids.length ? `${permName(p)} is granted to:\n${ids.map((id) => `- <@${id}>`).join("\n")}` : "No one is granted to this permission.";
  } else if (sub === "reset") {
    const user = interaction.options.getUser("user")!;
    resetPerms(guild.id, user.id);
    msg = `**${user.username}** doesn't have any permissions granted.`;
  } else if (sub === "reset_id") {
    const id = interaction.options.getString("user_id")!.trim();
    resetPerms(guild.id, id);
    msg = `**${id}** doesn't have any permissions granted.`;
  }

  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
