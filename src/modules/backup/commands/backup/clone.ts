import { SlashCommandBuilder, ChannelType, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { row, btn, st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("clone")
  .setDescription("Créer une copie d'un salon ou d'un rôle")
  .setDefaultMemberPermissions(8);

const gr = 0x5bd57b;
const rd = 0xc63a35;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("clone:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Cloner un salon")
        .setValue("channel")
        .setDescription("Copie un salon avec ses permissions")
        .setEmoji("📋"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Cloner un rôle")
        .setValue("role")
        .setDescription("Copie un rôle et ses permissions")
        .setEmoji("🎭")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📋 Cloner\nChoisis ce que tu veux cloner dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

async function doCloneChannel(interaction: MessageComponentInteraction, channel: any, childChannels: boolean): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
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
      await interaction.update({ components: [st("Success", gr, `Successfully **cloned the category** <#${channel.id}> and its channels.`)] });
    } else {
      const newChannel: any = await (guild.channels.create as any)({
        name: channel.name,
        type: channel.type,
        parent: (channel as any).parentId ?? undefined,
        permissionOverwrites: (channel as any).permissionOverwrites.cache?.map((o: any) => o) ?? [],
      });
      await interaction.update({ components: [st("Success", gr, `Successfully **cloned the channel** <#${newChannel.id}>.`)] });
    }
  } catch (err) {
    console.error("[clone] channel failed", err);
    await interaction.update({ components: [st("Error", rd, "An error occurred while cloning the channel.")] });
  }
}

async function doCloneRole(interaction: MessageComponentInteraction, role: any, applyOverwrites: boolean): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
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
    await interaction.update({ components: [st("Success", gr, `Successfully **cloned the role**: <@&${newRole.id}>.`)] });
  } catch (err) {
    console.error("[clone] role failed", err);
    await interaction.update({ components: [st("Error", rd, "An error occurred while cloning the role.")] });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  // Hub menu
  if (cid === "clone:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "channel") {
      const sel = new ChannelSelectMenuBuilder()
        .setCustomId("clone:pick_channel")
        .setPlaceholder("Sélectionne le salon à cloner…")
        .setChannelTypes([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory])
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📋 Cloner un salon\nSélectionne le salon à cloner."))
            .addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    if (action === "role") {
      const sel = new RoleSelectMenuBuilder()
        .setCustomId("clone:pick_role")
        .setPlaceholder("Sélectionne le rôle à cloner…")
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎭 Cloner un rôle\nSélectionne le rôle à cloner."))
            .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    return;
  }

  // Channel picked
  if (cid === "clone:pick_channel" && interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0]!;
    const channel: any = guild.channels.cache.get(channelId);
    if (!channel) {
      await interaction.update({ components: [st("Error", rd, "Channel not found.")] });
      return;
    }
    if (channel.type === ChannelType.GuildCategory) {
      await interaction.update({
        components: [
          st(
            "Clone Category", ACCENT, `Cloner la catégorie **${channel.name}** ?`,
            row(
              btn(`clone:do_chcat:${channelId}`, "Avec les sous-salons", ButtonStyle.Primary),
              btn(`clone:do_ch:${channelId}`, "Catégorie seule", ButtonStyle.Secondary)
            )
          ),
        ],
      });
      return;
    }
    await doCloneChannel(interaction, channel, false);
    return;
  }

  // Role picked
  if (cid === "clone:pick_role" && interaction.isRoleSelectMenu()) {
    const roleId = interaction.values[0]!;
    await interaction.update({
      components: [
        st(
          "Clone Role", ACCENT, `Cloner le rôle <@&${roleId}> ?`,
          row(
            btn(`clone:do_role:${roleId}`, "Cloner", ButtonStyle.Primary),
            btn(`clone:do_role_ow:${roleId}`, "Cloner + permissions salons", ButtonStyle.Secondary)
          )
        ),
      ],
    });
    return;
  }

  // Do clone actions
  if (cid.startsWith("clone:do_chcat:")) {
    const channel: any = guild.channels.cache.get(cid.slice("clone:do_chcat:".length));
    if (!channel) {
      await interaction.update({ components: [st("Error", rd, "Channel not found.")] });
      return;
    }
    await doCloneChannel(interaction, channel, true);
    return;
  }
  if (cid.startsWith("clone:do_ch:")) {
    const channel: any = guild.channels.cache.get(cid.slice("clone:do_ch:".length));
    if (!channel) {
      await interaction.update({ components: [st("Error", rd, "Channel not found.")] });
      return;
    }
    await doCloneChannel(interaction, channel, false);
    return;
  }
  if (cid.startsWith("clone:do_role_ow:")) {
    const role: any = guild.roles.cache.get(cid.slice("clone:do_role_ow:".length));
    if (!role) {
      await interaction.update({ components: [st("Error", rd, "Role not found.")] });
      return;
    }
    await doCloneRole(interaction, role, true);
    return;
  }
  if (cid.startsWith("clone:do_role:")) {
    const role: any = guild.roles.cache.get(cid.slice("clone:do_role:".length));
    if (!role) {
      await interaction.update({ components: [st("Error", rd, "Role not found.")] });
      return;
    }
    await doCloneRole(interaction, role, false);
    return;
  }
}
