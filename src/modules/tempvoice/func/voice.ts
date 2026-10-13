import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type { Guild, GuildMember, TextBasedChannel, PartialGroupDMChannel } from "discord.js";
import { createState, getSettings } from "./voiceState.ts";
import { addTemp, rmTemp as dbRemoveTemp, allTemps, addCreator, rmCreator as dbRemoveCreator, allCreators } from "./db.ts";

export const SETUP_URL = "https://tempvoice.xyz/assets/mockups/setup/setup.png";
export const INTRO_URL = "https://tempvoice.xyz/assets/mockups/introduction/introduction.png";

export const TV_ACCENT = 0xd53255;
const DEFAULT_BITRATE = 64000;

const tempChannels = new Set<string>();
const creatorChannels = new Set<string>();

export function loadChannels(): void {
  for (const id of allCreators()) creatorChannels.add(id);
  for (const id of allTemps()) tempChannels.add(id);
}

export function regTemp(channelId: string): void {
  tempChannels.add(channelId);
  addTemp(channelId);
}

export function unregTemp(channelId: string): void {
  tempChannels.delete(channelId);
  dbRemoveTemp(channelId);
}

export function isTemp(channelId: string): boolean {
  return tempChannels.has(channelId);
}

export function regCreator(channelId: string): void {
  creatorChannels.add(channelId);
  addCreator(channelId);
}

export function unregCreator(channelId: string): void {
  creatorChannels.delete(channelId);
  dbRemoveCreator(channelId);
}

export function isCreator(channelId: string): boolean {
  return creatorChannels.has(channelId);
}

const CANVAS_URL =
  "https://tempvoice.xyz/api/v2/canvas?language=en&features=voice_rename_button,voice_limit_button,voice_privacy_button,voice_waiting_button,voice_thread_button,voice_trust_button,voice_untrust_button,voice_invite_button,voice_kick_button,voice_region_button,voice_block_button,voice_unblock_button,voice_claim_button,voice_transfer_button,voice_close_button&quality=2&max";

export const INTERFACE_FEATURES = [
  { customId: "voice_rename_button", emoji: { id: "1161605686568960060", name: "name" } },
  { customId: "voice_limit_button", emoji: { id: "1161605683955900496", name: "limit" } },
  { customId: "voice_privacy_button", emoji: { id: "1161605688691261500", name: "privacy" } },
  { customId: "voice_waiting_button", emoji: { id: "1161605871227387965", name: "waiting" } },
  { customId: "voice_thread_button", emoji: { id: "1427941772163682408", name: "chat" } },
  { customId: "voice_trust_button", emoji: { id: "1161647139244490832", name: "trust" } },
  { customId: "voice_untrust_button", emoji: { id: "1162862846007320668", name: "untrust" } },
  { customId: "voice_invite_button", emoji: { id: "1161647152821444688", name: "invite" } },
  { customId: "voice_kick_button", emoji: { id: "1161605681107976263", name: "kick" } },
  { customId: "voice_region_button", emoji: { id: "1161605689576263753", name: "region" } },
  { customId: "voice_block_button", emoji: { id: "1161605864898174986", name: "block" } },
  { customId: "voice_unblock_button", emoji: { id: "1162862844585443370", name: "unblock" } },
  { customId: "voice_claim_button", emoji: { id: "1161605458054889472", name: "claim" } },
  { customId: "voice_transfer_button", emoji: { id: "1161647167488929963", name: "transfer" } },
  { customId: "voice_close_button", emoji: { id: "1161605459292205076", name: "delete" } },
] as const;

export function ifaceEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(TV_ACCENT)
    .setDescription(
      "# TempVoice Interface\nThis **interface** can be used to manage temporary voice channels. More options are available with **/voice** commands."
    )
    .setFooter({ text: "Press the buttons below to use the interface" })
    .setImage(CANVAS_URL);
}

export function ifaceRows(): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < INTERFACE_FEATURES.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const f of INTERFACE_FEATURES.slice(i, i + 5)) {
      row.addComponents(new ButtonBuilder().setCustomId(f.customId).setStyle(ButtonStyle.Secondary).setEmoji(f.emoji));
    }
    rows.push(row);
  }
  return rows;
}

export async function sendIface(
  channel: Exclude<TextBasedChannel, PartialGroupDMChannel>
): Promise<void> {
  await channel.send({ embeds: [ifaceEmbed()], components: ifaceRows() });
}

export async function mkCreator(guild: Guild, member?: GuildMember | null): Promise<string> {
  const category = await guild.channels.create({ name: "TEMPVOICE CATEGORY", type: ChannelType.GuildCategory });
  const botId = (member?.id ?? guild.client.user?.id) as string;
  const creator = await guild.channels.create({
    name: "➕ Creator Channel",
    type: ChannelType.GuildVoice,
    parent: category.id,
    bitrate: DEFAULT_BITRATE,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.Connect] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ],
  });
  regCreator(creator.id);
  return creator.id;
}

export async function mkIface(guild: Guild, member?: GuildMember | null): Promise<string> {
  const category = await guild.channels.create({ name: "TEMPVOICE CATEGORY", type: ChannelType.GuildCategory });
  const botId = (member?.id ?? guild.client.user?.id) as string;
  const interfaceChannel = await guild.channels.create({
    name: "✨・interface",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });
  await sendIface(interfaceChannel);
  return interfaceChannel.id;
}

export async function setupGuild(guild: Guild, member?: GuildMember | null): Promise<string> {
  const category = await guild.channels.create({ name: "TEMPVOICE CATEGORY", type: ChannelType.GuildCategory });
  const botId = (member?.id ?? guild.client.user?.id) as string;

  const creator = await guild.channels.create({
    name: "➕ Creator Channel",
    type: ChannelType.GuildVoice,
    parent: category.id,
    bitrate: 64000,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.Connect] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ],
  });
  regCreator(creator.id);

  const interfaceChannel = await guild.channels.create({
    name: "✨・interface",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });
  await sendIface(interfaceChannel);

  return creator.id;
}

export async function mkTempChan(guild: Guild, member: GuildMember, categoryId: string | null) {
  const botId = guild.client.user?.id as string;
  const settings = getSettings(guild.id, member.id);
  const channel = await guild.channels.create({
    name: settings.name ?? `${member.displayName}'s Channel`,
    type: ChannelType.GuildVoice,
    parent: categoryId ?? undefined,
    bitrate: DEFAULT_BITRATE,
    userLimit: settings.limit ?? 0,
    rtcRegion: settings.region ?? undefined,
    permissionOverwrites: [
      { id: guild.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
    ],
  });
  regTemp(channel.id);
  createState(channel.id, member.id);
  return channel;
}