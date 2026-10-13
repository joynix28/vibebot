import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { ensureGuild, parseWhitelist, wlAdd, wlRemove } from "../func/db.ts";

const ROLE_CATS = [
  { value: 0, name: "Roles: All" },
  { value: 15, name: "Roles: Ban" },
  { value: 16, name: "Roles: Kick" },
  { value: 17, name: "Roles: Bot-Add" },
  { value: 18, name: "Roles: Role-Update" },
  { value: 19, name: "Roles: Role-Add" },
  { value: 20, name: "Roles: Channel-Create" },
  { value: 21, name: "Roles: Channel-Delete" },
  { value: 24, name: "Roles: Role-Create" },
  { value: 25, name: "Roles: Role-Delete" },
  { value: 26, name: "Roles: Invite-Link" },
  { value: 31, name: "Roles: Prune" },
];
const USER_CATS = [
  { value: 1, name: "Users: All" },
  { value: 3, name: "Users: Ban" },
  { value: 4, name: "Users: Kick" },
  { value: 5, name: "Users: Bot-Add" },
  { value: 6, name: "Users: Role-Update" },
  { value: 7, name: "Users: Role-Add" },
  { value: 8, name: "Users: Channel-Create" },
  { value: 9, name: "Users: Channel-Delete" },
  { value: 12, name: "Users: Role-Create" },
  { value: 13, name: "Users: Role-Delete" },
  { value: 14, name: "Users: Invite-Link" },
  { value: 32, name: "Users: Prune" },
];
const CHANNEL_CATS = [
  { value: 2, name: "Channels: All" },
  { value: 30, name: "Channels: Invite-Link" },
];

function catsFor(sub: string) {
  if (sub.includes("role")) return ROLE_CATS;
  if (sub.includes("user")) return USER_CATS;
  return CHANNEL_CATS;
}
function typeFor(sub: string): "roles" | "users" | "channels" {
  if (sub.includes("role")) return "roles";
  if (sub.includes("user")) return "users";
  return "channels";
}

export const data = new SlashCommandBuilder()
  .setName("whitelist")
  .setDescription("Whitelist trusted friends and mods")
  .addSubcommand((s) =>
    s
      .setName("add_role")
      .setDescription("Add role to whitelist")
      .addRoleOption((o) => o.setName("role").setDescription("Select the role you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...ROLE_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("remove_role")
      .setDescription("Remove a role from whitelist")
      .addRoleOption((o) => o.setName("role").setDescription("Select the role you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...ROLE_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("view_roles")
      .setDescription("Shows current whitelisted roles")
      .addIntegerOption((o) => o.setName("category").setDescription("Select the category you want to view").setRequired(true).addChoices(...ROLE_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("add_channel")
      .setDescription("Add channel to whitelist")
      .addChannelOption((o) => o.setName("channel").setDescription("Select the channel you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...CHANNEL_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("remove_channel")
      .setDescription("Remove a channel from whitelist")
      .addChannelOption((o) => o.setName("channel").setDescription("Select the channel you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...CHANNEL_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("view_channels")
      .setDescription("Shows current whitelisted channels")
      .addIntegerOption((o) => o.setName("category").setDescription("Select the category you want to view").setRequired(true).addChoices(...CHANNEL_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("add_user")
      .setDescription("Add user to whitelist")
      .addUserOption((o) => o.setName("user").setDescription("Select the user you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...USER_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("remove_user")
      .setDescription("Remove a user from whitelist")
      .addUserOption((o) => o.setName("user").setDescription("Select the user you want to whitelist.").setRequired(true))
      .addIntegerOption((o) => o.setName("category").setDescription("The whitelist category").setRequired(true).addChoices(...USER_CATS))
  )
  .addSubcommand((s) =>
    s
      .setName("view_users")
      .setDescription("Shows current whitelisted users")
      .addIntegerOption((o) => o.setName("category").setDescription("Select the category you want to view").setRequired(true).addChoices(...USER_CATS))
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
  const cats = catsFor(sub);
  const type = typeFor(sub);
  const cat = cats.find((c) => c.value === interaction.options.getInteger("category"));
  const catName = cat?.name ?? "All";
  const wl = parseWhitelist(ensureGuild(guild.id));

  let msg = "";

  if (sub.startsWith("add_")) {
    const id = sub.includes("role")
      ? interaction.options.getRole("role")!.id
      : sub.includes("channel")
        ? interaction.options.getChannel("channel")!.id
        : interaction.options.getUser("user")!.id;
    wlAdd(guild.id, type, id);
    const mention = sub.includes("role") ? `<@&${id}>` : sub.includes("channel") ? `<#${id}>` : `<@${id}>`;
    msg = `**${mention}** has been whitelisted in the category **${catName}**.`;
  } else if (sub.startsWith("remove_")) {
    const id = sub.includes("role")
      ? interaction.options.getRole("role")!.id
      : sub.includes("channel")
        ? interaction.options.getChannel("channel")!.id
        : interaction.options.getUser("user")!.id;
    wlRemove(guild.id, type, id);
    const mention = sub.includes("role") ? `<@&${id}>` : sub.includes("channel") ? `<#${id}>` : `<@${id}>`;
    msg = `**${mention}** has been removed from the category **${catName}**.`;
  } else {
    const typeDisplay = catName.split(": ")[0] ?? "Roles";
    const suffix = catName.split(": ")[1] ?? "All";
    const list = wl[type];
    const rendered = list.length
      ? list.map((id) => (type === "roles" ? `<@&${id}>` : type === "channels" ? `<#${id}>` : `<@${id}>`)).join("\n")
      : "Empty";
    msg = `# Whitelisted ${typeDisplay}: ${suffix}\n${rendered}`;
  }

  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
