import { ChannelType } from "discord.js";
import type { Guild, TextChannel } from "discord.js";

const locked = new Map<string, Set<string>>();

export function isLocked(guildId: string, chId: string): boolean {
  return locked.get(guildId)?.has(chId) ?? false;
}

export function markLocked(guildId: string, chId: string): void {
  const s = locked.get(guildId) ?? new Set<string>();
  s.add(chId);
  locked.set(guildId, s);
}

export function unmarkLocked(guildId: string, chId: string): void {
  locked.get(guildId)?.delete(chId);
}

export async function lockChannel(ch: TextChannel, reason?: string): Promise<void> {
  await ch.permissionOverwrites.edit(ch.guild.id, { SendMessages: false }, { reason: reason || undefined });
}

export async function unlockChannel(ch: TextChannel, reason?: string): Promise<void> {
  await ch.permissionOverwrites.edit(ch.guild.id, { SendMessages: null }, { reason: reason || undefined });
}

export function textChannels(guild: Guild): TextChannel[] {
  return guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values().toArray() as TextChannel[];
}

export function logsBlock(names: string[], emoji: string): string {
  const tokens = names.map((n) => `\`#${n}\` ${emoji}`);
  let out = "Logs:";
  for (let i = 0; i < tokens.length; i += 2) {
    const line = tokens.slice(i, i + 2).join(" | ");
    const trailing = i + 2 > tokens.length && tokens.length % 2 === 1 ? " |" : "";
    out += `\n- ${line}${trailing}`;
  }
  return out;
}
