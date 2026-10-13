import { SlashCommandBuilder, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("clone")
  .setDescription("Create a clone of a channel or role")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("channel")
      .setDescription("Create a clone of channel including permission overwrites")
      .addChannelOption((o) => o.setName("channel").setDescription("No description").setRequired(true))
      .addBooleanOption((o) => o.setName("child_channels").setDescription("No description").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("role")
      .setDescription("Create a clone of a role optionally including channel permission overwrites")
      .addRoleOption((o) => o.setName("role").setDescription("The role to clone").setRequired(true))
      .addBooleanOption((o) => o.setName("apply_overwrites").setDescription("Whether to apply permission overwrites from the original role to the new one").setRequired(false))
  );

const gr = 0x5bd57b;
const rd = 0xc63a35;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;

  if (sub === "channel") {
    const channel = interaction.options.getChannel("channel")!;
    const childChannels = interaction.options.getBoolean("child_channels") ?? false;

    try {
      if (channel.type === ChannelType.GuildCategory && childChannels) {
        const children = guild.channels.cache.filter((c) => c.parentId === channel.id);
        const newCat = await (guild.channels.create as any)({
          name: channel.name,
          type: ChannelType.GuildCategory,
          permissionOverwrites: (channel as any).permissionOverwrites.cache?.map((o: any) => o) ?? [],
        });
        for (const child of children.values()) {
          await (guild.channels.create as any)({
            name: child.name,
            type: child.type,
            parent: newCat.id,
            permissionOverwrites: (child as any).permissionOverwrites.cache?.map((o: any) => o) ?? [],
          });
        }
      } else {
        const newChannel: any = await (guild.channels.create as any)({
          name: channel.name,
          type: channel.type,
          parent: (channel as any).parentId ?? undefined,
          permissionOverwrites: (channel as any).permissionOverwrites.cache?.map((o: any) => o) ?? [],
        });
        await interaction.reply({ components: [st("Success", gr, `Successfully **cloned the channel** <#${newChannel.id}>.`)], flags: V2E });
        return;
      }
      await interaction.reply({ components: [st("Success", gr, `Successfully **cloned the category** <#${channel.id}> and its channels.`)], flags: V2E });
    } catch (err) {
      console.error("[clone] channel failed", err);
      await interaction.reply({ components: [st("Error", rd, "An error occurred while cloning the channel.")], flags: V2E });
    }
    return;
  }

  if (sub === "role") {
    const role = interaction.options.getRole("role")!;
    const applyOverwrites = interaction.options.getBoolean("apply_overwrites") ?? false;
    try {
      const newRole = await guild.roles.create({
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        permissions: role.permissions as any,
        mentionable: role.mentionable,
        icon: (role as any).icon,
        unicodeEmoji: (role as any).unicodeEmoji,
      });
      if (applyOverwrites) {
        for (const channel of guild.channels.cache.values()) {
          const ow = (channel as any).permissionOverwrites?.cache?.get(role.id);
          if (ow) {
            await (channel as any).permissionOverwrites.create(newRole.id, { allow: ow.allow, deny: ow.deny }).catch(() => {});
          }
        }
      }
      await interaction.reply({ components: [st("Success", gr, `Successfully **cloned the role**: <@&${newRole.id}>.`)], flags: V2E });
    } catch (err) {
      console.error("[clone] role failed", err);
      await interaction.reply({ components: [st("Error", rd, "An error occurred while cloning the role.")], flags: V2E });
    }
  }
}
