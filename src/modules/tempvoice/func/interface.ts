import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from "discord.js";
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  ModalSubmitInteraction,
  GuildMember,
  VoiceChannel,
} from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  ACCENT,
  panel,
  type PanelBlock,
  textBlock,
  sepBlock,
  rowBlock,
  linkBtn,
} from "./ui.ts";
import { TV_ACCENT, isTemp, unregTemp } from "./voice.ts";
import {
  getState,
  saveState,
  rmState,
  regWaiting,
  unregWaiting,
  waitingTarget,
  saveSettings,
} from "./voiceState.ts";

const EMOJI_SETTINGS = { id: "585767366743293952", name: "settings" };
const INVITE_IMG = "https://tempvoice.xyz/assets/embeds/bot/copyright-invite.png";

const PRIVACY_OPTIONS = [
  { value: "locked", label: "Lock", desc: "Only trusted users will be able to join your voice channel", emoji: "1161605685201612840" },
  { value: "unlocked", label: "Unlock", desc: "Everyone will be able to join your voice channel", emoji: "1161605863111393352" },
  { value: "hidden", label: "Invisible", desc: "Only trusted users will be able to view your voice channel", emoji: "1161605867427348590" },
  { value: "unhidden", label: "Visible", desc: "Everyone will be able to view your voice channel", emoji: "1161605868522065922" },
  { value: "locked-chat", label: "Close Chat", desc: "Only trusted users will be able to text in your chat", emoji: "1161605462739918848" },
  { value: "unlocked-chat", label: "Open Chat", desc: "Everyone will be able to text in your chat", emoji: "1161605450828087346" },
];

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

function attention(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({
  components: [panel([textBlock(`## **${title}**\n${body}`)], TV_ACCENT)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

function success(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)])], flags: FLAGS_V2_EPHEMERAL });
}

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

function selfChan(member: GuildMember): VoiceChannel | null {
  const ch = member.voice.channel;
  if (!ch || !isTemp(ch.id) || ch.type !== ChannelType.GuildVoice) return null;
  return ch as VoiceChannel;
}

function needOwner(interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction, member: GuildMember): VoiceChannel | null {
  const ch = selfChan(member);
  if (!ch) {
    void attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return null;
  }
  const st = getState(ch.id);
  if (!st || st.ownerId !== member.id) {
    void attention(interaction, "Attention!", "You are not the owner of this temporary voice channel.");
    return null;
  }
  return ch;
}

export async function handleComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction | UserSelectMenuInteraction
): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith("user_")) {
    await handleUserButton(interaction as ButtonInteraction);
    return;
  }

  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }

  if (interaction.isStringSelectMenu()) {
    await handleSelect(interaction);
    return;
  }
  if (interaction.isUserSelectMenu()) {
    await handleUserSelect(interaction);
    return;
  }
  if (!interaction.isButton()) return;

  if (interaction.isButton()) {
    if (interaction.customId === "voice_claim_button") {
      const ch = selfChan(member);
      if (!ch) {
        await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
        return;
      }
      await claimChannel(interaction, ch);
      return;
    }
  }

  const channel = needOwner(interaction, member);
  if (!channel) return;

  switch (id) {
    case "voice_rename_button": {
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
      break;
    }
    case "voice_limit_button": {
      const opts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100].map((n) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(n === 0 ? "Unlimited" : `${n} users`)
        .setValue(String(n))
          .setEmoji({ id: "1161605683955900496", name: "limit" })
      );
      await interaction.reply({ components: [stringMenu("voice_limit_menu", "Select the user limit", opts)], flags: FLAGS_V2_EPHEMERAL });
    break;
    }
    case "voice_privacy_button":
    await interaction.reply({
        components: [stringMenu("voice_privacy_menu", "Select a Privacy Option", PRIVACY_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.desc).setEmoji({ id: o.emoji, name: o.label })))],
        flags: FLAGS_V2_EPHEMERAL,
      });
      break;
    case "voice_waiting_button":
      await mkWaiting(interaction, channel);
      break;
    case "voice_thread_button":
      await mkThread(interaction, channel);
    break;
    case "voice_trust_button":
      await interaction.reply({ components: [userMenu("voice_trust_menu", "Selected users will be trusted to join", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_untrust_button":
      await interaction.reply({ components: [userMenu("voice_untrust_menu", "Selected users will be untrusted", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_invite_button":
      await interaction.reply({ components: [userMenu("voice_invite_menu", "Selected user will be invited to join", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_kick_button":
      await interaction.reply({ components: [userMenu("voice_kick_menu", "The selected user will be kicked", 1, 3)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_region_button":
      await interaction.reply({
        components: [stringMenu("voice_region_menu", "Choose a channel region", REGION_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value ?? "null").setEmoji(REGION_EMOJI)))],
        flags: FLAGS_V2_EPHEMERAL,
      });
      break;
    case "voice_block_button":
      await interaction.reply({ components: [userMenu("voice_block_menu", "Selected users will be kicked and blocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_unblock_button":
      await interaction.reply({ components: [userMenu("voice_unblock_menu", "Selected users will be unblocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_transfer_button":
      await interaction.reply({ components: [userMenu("voice_transfer_menu", "The selected user will gain the ownership", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "voice_close_button":
      await closeConfirm(interaction);
      break;
    case "voice_close_confirm_button":
      await closeChan(interaction, channel);
      break;
    default:
      await attention(interaction, "Attention!", "Unknown action.");
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "voice_rename_modal") return;
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const channel = selfChan(member);
  if (!channel) {
    await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return;
  }
  const st = getState(channel.id);
  if (!st || st.ownerId !== member.id) {
    await attention(interaction, "Attention!", "You are not the owner of this temporary voice channel.");
    return;
  }
  const now = Date.now();
  if (now - st.lastRename < 5 * 60_000) {
    const next = Math.floor((st.lastRename + 5 * 60_000) / 1000);
    await attention(
      interaction,
      "Slow Down!",
      `This command can be used again **<t:${next}:R>**.\n### Why do I have to wait?\nThis command changes the name of your temporary channel, this is only possible [every 5 minutes](https://easy.tempvoice.xyz/faq/limits#discord-api).`
    );
  return;
  }
  const name = interaction.fields.getTextInputValue("name").trim();
  if (name) {
    await channel.setName(name);
    st.lastRename = now;
    saveState(channel.id);
    saveSettings(channel.guild.id, member.id, { name });
  }
  await success(interaction, "Updated!", `<#${channel.id}>'s name is now **${name}**.`);
}

async function handleSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const value = interaction.values[0] ?? "";

  switch (interaction.customId) {
    case "voice_privacy_menu": {
    const st = getState(channel.id);
      if (!st) {
        await attention(interaction, "Attention!", "Channel state was not found.");
        return;
      }
      await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: null, Connect: null });
      switch (value) {
        case "locked":
          await channel.permissionOverwrites.edit(channel.guild.id, { Connect: false });
          st.locked = true;
          saveState(channel.id);
          await success(interaction, "Updated!", `<#${channel.id}> is now **locked**.`);
          break;
        case "unlocked":
          await channel.permissionOverwrites.edit(channel.guild.id, { Connect: true });
          st.locked = false;
          saveState(channel.id);
          await success(interaction, "Updated!", `<#${channel.id}> is no longer **locked**.`);
          break;
        case "hidden":
          await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: false });
          st.hidden = true;
          saveState(channel.id);
          await success(interaction, "Updated!", `<#${channel.id}> is now **invisible**.`);
          break;
        case "unhidden":
          await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: true });
          st.hidden = false;
          saveState(channel.id);
        await success(interaction, "Updated!", `<#${channel.id}> is now **visible**.`);
          break;
        case "locked-chat":
          st.chatLocked = true;
          saveState(channel.id);
          await success(interaction, "Updated!", `<#${channel.id}> **chat** is now **locked**.`);
        break;
        case "unlocked-chat":
          st.chatLocked = false;
          saveState(channel.id);
          await success(interaction, "Updated!", `<#${channel.id}> **chat** is now **unlocked**.`);
          break;
      }
    break;
    }
    case "voice_limit_menu": {
      const limit = Number(value);
      await channel.setUserLimit(limit);
      saveSettings(channel.guild.id, member.id, { limit });
      await success(interaction, "Updated!", `<#${channel.id}>'s user limit is now **${limit === 0 ? "unlimited" : limit}**.`);
      break;
    }
    case "voice_region_menu": {
      const region = value === "null" || !value ? null : value;
      await channel.setRTCRegion(region);
      saveSettings(channel.guild.id, member.id, { region });
    const label = REGION_OPTIONS.find((r) => (r.value ?? "null") === value)?.label ?? region ?? "automatic";
      await success(interaction, "Updated!", `<#${channel.id}>'s region is now **${label.toLowerCase()}**.`);
      break;
    }
    case "voice_waiting_menu": {
      await waitingResponse(interaction, channel, value);
      break;
    }
    default:
      await attention(interaction, "Attention!", "Unknown action.");
  }
}

async function handleUserSelect(interaction: UserSelectMenuInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const userIds = interaction.values;
  const guild = channel.guild;
  const st = getState(channel.id);
  if (!st) {
    await attention(interaction, "Attention!", "Channel state was not found.");
    return;
  }

  switch (interaction.customId) {
    case "voice_trust_menu": {
      const skipped: string[] = [];
      for (const uid of userIds) {
        if (uid === member.id) { skipped.push(uid); continue; }
        st.trusted.add(uid);
      }
      saveState(channel.id);
      const blocks: PanelBlock[] = [
        textBlock("## **Trusted!**\nSelected users are now trusted in your temporary voice channels."),
      ];
    if (skipped.length) {
        blocks.push(sepBlock());
        blocks.push(textBlock(`-# Some users were skipped: \n${skipped.map((u) => `<@${u}> (is you)`).join("\n")}`));
      }
      await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
      break;
    }
    case "voice_untrust_menu": {
      for (const uid of userIds) st.trusted.delete(uid);
      saveState(channel.id);
      await success(interaction, "Untrusted!", "Selected users are no longer trusted in your temporary voice channels.");
      break;
    }
    case "voice_invite_menu": {
      const uid = userIds[0];
      if (!uid) {
        await attention(interaction, "Attention!", "No user selected.");
        break;
      }
      const target = await guild.members.fetch(uid).catch(() => null);
      if (target) {
        await sendInvite(target, member.id, channel.id).catch(() => {});
      }
      await success(interaction, "Invited!", "An invitation to join your temporary voice channel was sent to the user.");
    break;
    }
    case "voice_kick_menu": {
      const invalid: string[] = [];
      for (const uid of userIds) {
        const m = channel.members.get(uid);
        if (!m) { invalid.push(`${uid}:is not in this voice channel`); continue; }
      await m.voice.disconnect().catch(() => {});
      }
      if (invalid.length) {
        const lines = invalid.map((s) => {
        const [uid, reason] = s.split(":");
          return `<@${uid}> (${reason})`;
        });
        await attention(interaction, "Attention!", `You cannot use this command for: \n${lines.join("\n")}`);
      } else {
        await success(interaction, "Kicked!", "Selected users have been kicked out of your temporary voice channel.");
      }
      break;
    }
    case "voice_block_menu": {
      for (const uid of userIds) {
        st.blocked.add(uid);
        await channel.permissionOverwrites.edit(uid, { Connect: false }).catch(() => {});
        const m = channel.members.get(uid);
        if (m) await m.voice.disconnect().catch(() => {});
      }
    saveState(channel.id);
      await success(interaction, "Blocked!", "Selected users have been blocked from your temporary voice channels.");
      break;
    }
  case "voice_unblock_menu": {
      for (const uid of userIds) {
        st.blocked.delete(uid);
        await channel.permissionOverwrites.edit(uid, { Connect: true }).catch(() => {});
      }
      saveState(channel.id);
      await success(interaction, "Unblocked!", "Selected users have been unblocked from your temporary voice channels.");
      break;
    }
    case "voice_transfer_menu": {
      const uid = userIds[0];
      if (!uid) {
        await attention(interaction, "Attention!", "No user selected.");
        break;
      }
      const target = channel.members.get(uid);
      if (!target) {
      await attention(interaction, "Attention!", "You can only transfer ownership of your channel to a user who is connected.");
        return;
      }
      st.ownerId = uid;
      saveState(channel.id);
      await success(interaction, "Transferred!", `You transferred the channel's ownership to <@${uid}>.`);
      break;
    }
    default:
      await attention(interaction, "Attention!", "Unknown action.");
  }
}

async function mkWaiting(interaction: ButtonInteraction, channel: VoiceChannel): Promise<void> {
  const st = getState(channel.id);
  if (!st) {
    await attention(interaction, "Attention!", "Channel state was not found.");
    return;
  }
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

async function mkThread(interaction: ButtonInteraction, channel: VoiceChannel): Promise<void> {
  const st = getState(channel.id);
  if (!st) {
    await attention(interaction, "Attention!", "Channel state was not found.");
    return;
  }
  const owner = await channel.guild.members.fetch(st.ownerId).catch(() => null);
  const interfaceChannel = channel.guild.channels.cache.find(
  (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name === "✨・interface"
  ) as import("discord.js").TextChannel | undefined;
  if (!interfaceChannel) {
    await attention(interaction, "Attention!", "No interface channel was found for this server.");
    return;
  }

  const members = Array.from(channel.members.values());
  const thread = await interfaceChannel.threads.create({
    name: owner?.displayName ?? "Voice Chat",
    autoArchiveDuration: 10080,
    type: ChannelType.PrivateThread,
    invitable: false,
  });
  for (const m of members) {
    await thread.members.add(m.id).catch(() => {});
  }
  st.threadId = thread.id;
  saveState(channel.id);
  await thread.send({
    content: `-# ${members.map((m) => `<@${m.id}>`).join(" ")} ${owner ? `<@${owner.id}>` : ""}`.trim(),
  });
  await success(interaction, "Created!", "A temporary thread has been created for this channel.");
}

async function claimChannel(interaction: ButtonInteraction, channel: VoiceChannel): Promise<void> {
  const member = interaction.member as GuildMember;
  const st = getState(channel.id);
  if (!st) {
    await attention(interaction, "Attention!", "Channel state was not found.");
    return;
  }
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
  await success(interaction, "Claimed!", "You now have ownership of this temporary voice channel.");
}

async function closeConfirm(interaction: ButtonInteraction): Promise<void> {
  const blocks: PanelBlock[] = [
    textBlock("## **Are You Sure?**\nYour temporary voice channel will be deleted. Please confirm by using the button below."),
  ];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
      .setCustomId("voice_close_confirm_button")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: "1161605459292205076", name: "delete" })
  );
  await interaction.reply({ components: [panel(blocks), row], flags: FLAGS_V2_EPHEMERAL });
}

async function closeChan(interaction: ButtonInteraction, channel: VoiceChannel): Promise<void> {
  const st = getState(channel.id);
  const blocks: PanelBlock[] = [
    textBlock(`## **Closed!**\n<#${channel.id}> has been deleted.`),
  ];
  await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
  rmState(channel.id);
  unregTemp(channel.id);
  if (st?.waitingChannelId) {
    const w = channel.guild.channels.cache.get(st.waitingChannelId);
    if (w) await w.delete().catch(() => {});
    unregWaiting(st.waitingChannelId);
  }
  await channel.delete().catch(() => {});
}

async function waitingResponse(interaction: StringSelectMenuInteraction, channel: VoiceChannel, value: string): Promise<void> {
  const st = getState(channel.id);
  if (!st || !st.waitingChannelId) {
    await attention(interaction, "Attention!", "There is no waiting room for this channel.");
    return;
  }
  const waitingChannel = channel.guild.channels.cache.get(st.waitingChannelId);
  const joiner =
    waitingChannel && waitingChannel.isVoiceBased()
      ? Array.from(waitingChannel.members.values()).find((m) => m.id !== st.ownerId)
      : undefined;
  if (!joiner) {
    await attention(interaction, "Attention!", "There is no one waiting to join this channel.");
    return;
  }

  if (value === "accept") {
    await joiner.voice.setChannel(channel.id).catch(() => {});
    await success(interaction, "Accepted!", `<@${joiner.id}> has been moved into your voice channel.`);
  } else {
    st.blocked.add(joiner.id);
    await channel.permissionOverwrites.edit(joiner.id, { Connect: false }).catch(() => {});
    await joiner.voice.disconnect().catch(() => {});
    saveState(channel.id);
    await success(interaction, "Denied!", `<@${joiner.id}> has been kicked and blocked.`);
  }
}

async function sendInvite(target: GuildMember, ownerId: string, channelId: string): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x23a55a)
    .setDescription(`## **New Invitation!**\n<@${ownerId}> has invited you to join <#${channelId}>`)
    .setFooter({ text: ownerId })
    .setImage(INVITE_IMG);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("user_toggle_inviter").setLabel("Block Inviter").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji({ id: "1161605864898174986", name: "block" }),
    new ButtonBuilder().setCustomId("user_toggle_invites").setLabel("Block Invites").setStyle(ButtonStyle.Secondary).setDisabled(true).setEmoji({ id: "1161605685201612840", name: "lock" })
  );
  await target.send({
    content: `https://discord.com/channels/${target.guild.id}/${channelId}`,
    embeds: [embed],
    components: [row],
  });
}

function unregisterTempChannelId(channelId: string): void {}

async function handleUserButton(interaction: ButtonInteraction): Promise<void> {
  await interaction.reply({
    components: [panel([textBlock("## **Not supported yet.**")])],
    flags: FLAGS_V2_EPHEMERAL,
  });
}