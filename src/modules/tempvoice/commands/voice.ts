import {
  SlashCommandBuilder,
  ChannelType,
  ActionRowBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  GuildMember,
  VoiceChannel,
  TextChannel,
} from "discord.js";
import { FLAGS_V2_EPHEMERAL, panel, type PanelBlock, textBlock, sepBlock } from "../func/ui.ts";
import { isTemp, unregTemp, TV_ACCENT } from "../func/voice.ts";
import {
  getState,
  saveState,
  rmState,
  saveSettings,
  regWaiting,
  unregWaiting,
} from "../func/voiceState.ts";
import { handleComponent as ifaceComponent, handleModal as ifaceModal } from "../func/interface.ts";
import type { MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";

const REGION_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Automatic (Default)" },
  { value: "brazil", label: "Brazil" },
  { value: "hongkong", label: "Hong Kong" },
  { value: "india", label: "India" },
  { value: "japan", label: "Japan" },
  { value: "rotterdam", label: "Rotterdam" },
  { value: "singapore", label: "Singapore" },
  { value: "southafrica", label: "South Africa" },
  { value: "sydney", label: "Sydney" },
  { value: "us-central", label: "US Central" },
  { value: "us-east", label: "US East" },
  { value: "us-south", label: "US South" },
  { value: "us-west", label: "US West" },
];

const REGION_EMOJI = { id: "1161605689576263753", name: "region" };

const PRIVACY_OPTIONS = [
  { value: "locked", label: "Lock", desc: "Only trusted users will be able to join your voice channel", emoji: "1161605685201612840" },
  { value: "unlocked", label: "Unlock", desc: "Everyone will be able to join your voice channel", emoji: "1161605863111393352" },
  { value: "hidden", label: "Invisible", desc: "Only trusted users will be able to view your voice channel", emoji: "1161605867427348590" },
  { value: "unhidden", label: "Visible", desc: "Everyone will be able to view your voice channel", emoji: "1161605868522065922" },
  { value: "locked-chat", label: "Close Chat", desc: "Only trusted users will be able to text in your chat", emoji: "1161605462739918848" },
  { value: "unlocked-chat", label: "Open Chat", desc: "Everyone will be able to text in your chat", emoji: "1161605450828087346" },
];

function stringMenu(customId: string, placeholder: string, options: StringSelectMenuOptionBuilder[]) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(options)
  );
}

function userMenu(customId: string, placeholder: string, min: number, max: number) {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(min).setMaxValues(max)
  );
}

export const data = new SlashCommandBuilder()
  .setName("voice")
  .setDescription("Manage your temporary voice channels")
  .addSubcommand((s) => s.setName("name").setDescription("Change the name of your temporary channel").addStringOption((o) => o.setName("input").setDescription("The new channel name").setRequired(false).setMaxLength(100)))
  .addSubcommand((s) => s.setName("limit").setDescription("Change the user limit of your temporary channel"))
  .addSubcommand((s) => s.setName("bitrate").setDescription("Change the bitrate of your temporary channel").addIntegerOption((o) => o.setName("input").setDescription("Bitrate in kbps").setRequired(true).setMinValue(8).setMaxValue(384)))
  .addSubcommand((s) => s.setName("region").setDescription("Change the region of your temporary channel"))
  .addSubcommand((s) => s.setName("privacy").setDescription("Lock or hide your temporary channel"))
  .addSubcommand((s) => s.setName("password").setDescription("Set a password for your temporary channel").addStringOption((o) => o.setName("password").setDescription("Channel password").setRequired(true)))
  .addSubcommand((s) => s.setName("status").setDescription("Change the status of your temporary channel").addStringOption((o) => o.setName("status").setDescription("Channel status").setRequired(true).setMaxLength(500)))
  .addSubcommand((s) => s.setName("claim").setDescription("Claim a temporary channel and gain ownership of it"))
  .addSubcommand((s) => s.setName("delete").setDescription("Delete your temporary channel"))
  .addSubcommand((s) => s.setName("info").setDescription("Get information about a temporary channel"))
  .addSubcommand((s) => s.setName("invite").setDescription("Send an invite link to your temporary channel in this chat").addStringOption((o) => o.setName("message").setDescription("Message to include with the invite").setRequired(false)))
  .addSubcommand((s) => s.setName("reset").setDescription("Reset the configuration of your temporary channel"))
  .addSubcommand((s) => s.setName("thread").setDescription("Create a temporary thread for your temporary channel"))
  .addSubcommand((s) => s.setName("transfer").setDescription("Transfer the ownership of your temporary channel to another user"))
  .addSubcommand((s) => s.setName("waiting").setDescription("Create a waiting room for join request to your temporary channel"))
  .addSubcommandGroup((g) =>
    g.setName("user").setDescription("Manage users in your temporary channel")
    .addSubcommand((s) => s.setName("block").setDescription("Block users from accessing your temporary channel"))
      .addSubcommand((s) => s.setName("unblock").setDescription("Unblock users from your temporary channel"))
      .addSubcommand((s) => s.setName("trust").setDescription("Trust users with permanent access to your temporary channel"))
      .addSubcommand((s) => s.setName("untrust").setDescription("Remove trusted users access to your temporary channel"))
      .addSubcommand((s) => s.setName("kick").setDescription("Kick a user from your temporary channel"))
      .addSubcommand((s) => s.setName("invite").setDescription("Invite a user to your temporary channel"))
  );

function attention(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)], TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

function success(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)])], flags: FLAGS_V2_EPHEMERAL });
}

function ownedChannel(member: GuildMember): VoiceChannel | null {
  const ch = member.voice.channel;
  if (!ch || !isTemp(ch.id) || ch.type !== ChannelType.GuildVoice) return null;
  return ch as VoiceChannel;
}

function currentChannel(member: GuildMember): VoiceChannel | null {
  const ch = member.voice.channel;
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch as VoiceChannel;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const sub = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup(false);

  if (group === "user") {
    await handleUserSubcommand(interaction, member, sub);
    return;
  }

  switch (sub) {
    case "name": await rename(interaction, member); break;
    case "limit": await limit(interaction, member); break;
    case "bitrate": await bitrate(interaction, member); break;
    case "region": await region(interaction, member); break;
    case "privacy": await privacy(interaction, member); break;
    case "password": await password(interaction, member); break;
    case "status": await status(interaction, member); break;
    case "claim": await claim(interaction, member); break;
    case "delete": await deleteChannel(interaction, member); break;
    case "info": await info(interaction, member); break;
    case "invite": await invite(interaction, member); break;
  case "reset": await reset(interaction, member); break;
    case "thread": await thread(interaction, member); break;
    case "transfer": await transfer(interaction, member); break;
    case "waiting": await waiting(interaction, member); break;
    default:
      await attention(interaction, "Attention!", "Unknown subcommand.");
  }
}

function needOwner(interaction: ChatInputCommandInteraction, member: GuildMember): VoiceChannel | null {
  const ch = ownedChannel(member);
  if (!ch) {
    void attention(interaction, "Attention!", "You are not the owner of a temporary voice channel.");
    return null;
  }
  const st = getState(ch.id);
  if (!st || st.ownerId !== member.id) {
    void attention(interaction, "Attention!", "You are not the owner of this temporary voice channel.");
    return null;
  }
  return ch;
}

async function rename(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const input = interaction.options.getString("input");
  if (!input) {
    await interaction.showModal(
      new ModalBuilder()
        .setCustomId("voice_rename_modal")
        .setTitle("Rename your Channel")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("name").setLabel("Channel Name").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)
          )
        )
    );
  return;
  }
  const st = getState(channel.id)!;
  const now = Date.now();
  if (now - st.lastRename < 5 * 60_000) {
    const next = Math.floor((st.lastRename + 5 * 60_000) / 1000);
    await attention(interaction, "Slow Down!", `This command can be used again **<t:${next}:R>**.\n### Why do I have to wait?\nThis command changes the name of your temporary channel, this is only possible [every 5 minutes](https://easy.tempvoice.xyz/faq/limits#discord-api).`);
    return;
  }
  await channel.setName(input);
  st.lastRename = now;
  saveState(channel.id);
  saveSettings(channel.guild.id, member.id, { name: input });
  await success(interaction, "Updated!", `<#${channel.id}>'s name is now **${input}**.`);
}

async function limit(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100].map((n) =>
    new StringSelectMenuOptionBuilder().setLabel(n === 0 ? "Unlimited" : `${n} users`).setValue(String(n)).setEmoji({ id: "1161605683955900496", name: "limit" })
  );
  await interaction.reply({ components: [stringMenu("voice_limit_menu", "Select the user limit", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function bitrate(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const value = interaction.options.getInteger("input", true);
  await channel.setBitrate(value * 1000);
  await success(interaction, "Updated!", `<#${channel.id}>'s bitrate is now **${value}kbps**.`);
}

async function region(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = REGION_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value ?? "null").setEmoji(REGION_EMOJI));
  await interaction.reply({ components: [stringMenu("voice_region_menu", "Choose a channel region", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function privacy(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = PRIVACY_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.desc).setEmoji({ id: o.emoji, name: o.label }));
  await interaction.reply({ components: [stringMenu("voice_privacy_menu", "Select a Privacy Option", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function password(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const value = interaction.options.getString("password", true);
  const st = getState(channel.id)!;
  st.password = value;
  saveState(channel.id);
  await success(interaction, "Updated!", `<#${channel.id}>'s password is now \`${value}\`.`);
}

async function status(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const value = interaction.options.getString("status", true);
  await channel.client.rest.patch(`/channels/${channel.id}`, { body: { status: value } }).catch(() => {});
  await success(interaction, "Updated!", `<#${channel.id}>'s status is now **${value}**.`);
}

async function claim(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = currentChannel(member);
  if (!channel || !isTemp(channel.id)) {
    await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return;
  }
  const st = getState(channel.id)!;
  if (st.ownerId === member.id) {
    await attention(interaction, "Attention!", "You cannot claim your own temporary voice channel.");
  return;
  }
  if (channel.members.has(st.ownerId)) {
    await attention(interaction, "Attention!", `The owner, <@${st.ownerId}>, is still connected to this temporary voice channel.`);
    return;
  }
  st.ownerId = member.id;
  saveState(channel.id);
  await channel.permissionOverwrites.edit(st.ownerId, { ViewChannel: true, Connect: true });
  await success(interaction, "Claimed!", `You claimed **<#${channel.id}>**.`);
}

async function deleteChannel(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id);
  rmState(channel.id);
  unregTemp(channel.id);
  if (st?.waitingChannelId) {
    const w = channel.guild.channels.cache.get(st.waitingChannelId);
    if (w) await w.delete().catch(() => {});
    unregWaiting(st.waitingChannelId);
  }
  await channel.delete().catch(() => {});
  await success(interaction, "Closed!", `<#${channel.id}> has been deleted.`);
}

async function info(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = currentChannel(member);
  if (!channel || !isTemp(channel.id)) {
    await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return;
  }
  const st = getState(channel.id);
  const blocks: PanelBlock[] = [
    textBlock(`# ${channel.name}`),
    sepBlock(),
    textBlock(`> **Owner:** <@${st?.ownerId ?? "?"}>`),
    textBlock(`> **User limit:** ${channel.userLimit === 0 ? "Unlimited" : channel.userLimit}`),
    textBlock(`> **Bitrate:** ${channel.bitrate / 1000}kbps`),
    textBlock(`> **Region:** ${channel.rtcRegion ?? "Automatic"}`),
    textBlock(`> **Locked:** ${st?.locked ? "Yes" : "No"}`),
    textBlock(`> **Hidden:** ${st?.hidden ? "Yes" : "No"}`),
    textBlock(`> **Members:** ${channel.members.size}`),
  ];
  await interaction.reply({ components: [panel(blocks, TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

async function invite(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
  if (!invite) {
    await attention(interaction, "Attention!", "Unable to create an invite for this channel.");
  return;
  }
  const message = interaction.options.getString("message");
  const link = `https://discord.gg/${invite.code}`;
  if (message) {
    await success(interaction, "Invite!", `${message}\nJoin <#${channel.id}>: ${link}`);
  } else {
    await success(interaction, "Invite!", `Join <#${channel.id}>: ${link}`);
  }
}

async function reset(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  await channel.setName(`${member.displayName}'s Channel`);
  await channel.setUserLimit(0);
  await channel.setRTCRegion(null);
  await channel.setBitrate(64000);
  await channel.client.rest.patch(`/channels/${channel.id}`, { body: { status: null } }).catch(() => {});
  await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: true, Connect: true });
  st.locked = false;
  st.hidden = false;
  st.chatLocked = false;
  st.password = null;
  st.lastRename = 0;
  saveState(channel.id);
  saveSettings(channel.guild.id, member.id, { name: `${member.displayName}'s Channel`, limit: 0, region: null });
  await success(interaction, "Reset!", `<#${channel.id}>'s configuration has been reset.`);
}

async function thread(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  const owner = await channel.guild.members.fetch(st.ownerId).catch(() => null);
  const interfaceChannel = channel.guild.channels.cache.find(
    (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name === "✨・interface"
  ) as TextChannel | undefined;
  if (!interfaceChannel) {
    await attention(interaction, "Attention!", "No interface channel was found for this server.");
    return;
  }
  const members = Array.from(channel.members.values());
  const t = await interfaceChannel.threads.create({
    name: owner?.displayName ?? "Voice Chat",
    autoArchiveDuration: 10080,
    type: ChannelType.PrivateThread,
    invitable: false,
  });
  for (const m of members) await t.members.add(m.id).catch(() => {});
  st.threadId = t.id;
  saveState(channel.id);
  await t.send({ content: `-# ${members.map((m) => `<@${m.id}>`).join(" ")} ${owner ? `<@${owner.id}>` : ""}`.trim() });
  await success(interaction, "Created!", "A temporary thread has been created for this channel.");
}

async function transfer(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  await interaction.reply({ components: [userMenu("voice_transfer_menu", "The selected user will gain the ownership", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
}

async function waiting(interaction: ChatInputCommandInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  if (st.hidden) {
    await attention(interaction, "Attention!", "You cannot create a waiting room when your channel is hidden.");
    return;
  }
  if (st.waiting && st.waitingChannelId) {
    await success(interaction, "Created!", "A waiting room is already available for this channel.");
    return;
  }
  const owner = await channel.guild.members.fetch(st.ownerId).catch(() => null);
  const waiting = await channel.guild.channels.create({
    name: `Ask ${owner?.displayName ?? "the owner"} to join`,
    type: ChannelType.GuildVoice,
    parent: channel.parentId,
    bitrate: 64000,
    permissionOverwrites: [
      { id: channel.guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.SendMessages] },
      { id: channel.guild.client.user?.id as string, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
    ],
  });
  st.waiting = true;
  st.waitingChannelId = waiting.id;
  saveState(channel.id);
  regWaiting(waiting.id, channel.id);
  await success(interaction, "Created!", "A waiting room has been created for this channel.");
}

async function handleUserSubcommand(interaction: ChatInputCommandInteraction, member: GuildMember, sub: string): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  switch (sub) {
  case "block":
      await interaction.reply({ components: [userMenu("voice_block_menu", "Selected users will be kicked and blocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "unblock":
      await interaction.reply({ components: [userMenu("voice_unblock_menu", "Selected users will be unblocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "trust":
      await interaction.reply({ components: [userMenu("voice_trust_menu", "Selected users will be trusted to join", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "untrust":
      await interaction.reply({ components: [userMenu("voice_untrust_menu", "Selected users will be untrusted", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "kick":
      await interaction.reply({ components: [userMenu("voice_kick_menu", "The selected user will be kicked", 1, 3)], flags: FLAGS_V2_EPHEMERAL });
    break;
    case "invite":
      await interaction.reply({ components: [userMenu("voice_invite_menu", "Selected user will be invited to join", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
      break;
  }
}

/** Tous les customIds `voice_*` (panneau d'interface, menus, modals) sont routés ici. */
export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  await ifaceComponent(interaction as any);
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  await ifaceModal(interaction);
}
