import { Events, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionFlagsBits } from "discord.js";
import type { VoiceState } from "discord.js";
import { isCreator, mkTempChan, isTemp, unregTemp } from "../../func/voice.ts";
import { isWaitingRoom, waitingTarget, getState, rmState } from "../../func/voiceState.ts";

export const name = Events.VoiceStateUpdate;

export async function execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const member = newState.member;
  if (!member || member.user.bot) return;
  if (oldState.channelId === newState.channelId) return;

  if (newState.channelId) {
    const channel = newState.channel;
    if (!channel) return;

    if (isWaitingRoom(channel.id)) {
      await notifyOwner(newState, channel.id);
      return;
    }

    if (isCreator(channel.id)) {
      try {
        const tempChannel = await mkTempChan(newState.guild, member, channel.parentId);
        await newState.setChannel(tempChannel.id);
    } catch (err) {
        console.error(`[voice] failed to create temp channel for ${member.user.tag}`, err);
      }
      return;
    }

    if (isTemp(channel.id)) {
      await addToThread(newState.guild, channel.id, member.id);
    }
  }

  const oldChannel = oldState.channel;
  if (!oldChannel || !oldChannel.isVoiceBased()) return;

  if (isTemp(oldChannel.id)) {
    await rmFromThread(newState.guild, oldChannel.id, member.id);
    if (oldChannel.members.size === 0) {
      rmState(oldChannel.id);
      unregTemp(oldChannel.id);
      await oldChannel.delete().catch(() => {});
    }
    return;
  }

  if (isWaitingRoom(oldChannel.id)) {
    return;
  }
}

async function notifyOwner(newState: VoiceState, waitingChannelId: string): Promise<void> {
  const tempChannelId = waitingTarget(waitingChannelId);
  if (!tempChannelId) return;
  const tempChannel = newState.guild.channels.cache.get(tempChannelId);
  if (!tempChannel?.isVoiceBased()) return;
  const st = getState(tempChannelId);
  const ownerId = st?.ownerId ?? newState.guild.ownerId;

  const menu = new StringSelectMenuBuilder()
    .setCustomId("voice_waiting_menu")
    .setPlaceholder(`@${newState.member?.user.username} wants to join your Channel`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Accept").setValue("accept").setDescription("User will be moved into your voice channel").setEmoji({ id: "1161647139244490832", name: "trust" }),
    new StringSelectMenuOptionBuilder().setLabel("Deny").setValue("deny").setDescription("User will be kicked and blocked").setEmoji({ id: "1161605864898174986", name: "block" })
    );

  await tempChannel.send({
    content: `-# <@${ownerId}> <@${newState.member?.user.id}> <#${waitingChannelId}>`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  });
}

async function addToThread(guild: import("discord.js").Guild, channelId: string, memberId: string): Promise<void> {
  const st = getState(channelId);
  if (!st?.threadId) return;
  const thread = guild.channels.cache.get(st.threadId);
  if (thread?.isThread()) await thread.members.add(memberId).catch(() => {});
}

async function rmFromThread(guild: import("discord.js").Guild, channelId: string, memberId: string): Promise<void> {
  const st = getState(channelId);
  if (!st?.threadId) return;
  const thread = guild.channels.cache.get(st.threadId);
  if (thread?.isThread()) await thread.members.remove(memberId).catch(() => {});
}