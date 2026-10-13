import { Events, PermissionFlagsBits } from "discord.js";
import type { Message } from "discord.js";
import { getProtectConfig, isWhitelisted } from "../../func/db.ts";
import { getLimits } from "../../func/antiraid/limits.ts";
import { enableRaidmode, trackSpamSignal } from "../../func/antiraid/raidmode.ts";
import { FLAGS_V2, msgPanel } from "../../../../core/ui.ts";

// Anti-spam + auto-raidmode + modération automatique (liens / invitations).
// Porte de antiSpam.js (NdProtect) + logique config automod.

export const name = Events.MessageCreate;

const LINK_RE = /https?:\/\/[^\s<]+/i;
const INVITE_RE = /(?:discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[^\s<]+/i;
const MENTION_LIMIT = 5;
const WARN_TTL_MS = 10 * 60 * 1000;
const MUTE_MS = 5 * 60 * 1000;

interface SpamBucket {
  count: number;
  messages: Message[];
  timer: ReturnType<typeof setTimeout> | null;
}

const buckets = new Map<string, SpamBucket>();
const warnedAt = new Map<string, number>();

async function warnEphemeral(channel: Message["channel"], text: string): Promise<void> {
  if (!("send" in channel)) return;
  const msg = await channel.send({ components: [msgPanel(text)], flags: FLAGS_V2 }).catch(() => null);
  if (msg) setTimeout(() => msg.delete().catch(() => {}), 5000);
}

async function deleteMessages(channel: Message["channel"], messages: Message[]): Promise<void> {
  const bulk = channel as unknown as { bulkDelete?: (msgs: Message[]) => Promise<unknown> };
  if (typeof bulk.bulkDelete === "function") {
    await bulk.bulkDelete(messages).catch(() => null);
    return;
  }
  for (const m of messages) await m.delete().catch(() => null);
}

/** Avertissement puis mute (timeout 5 min, repli kick) en cas de récidive. */
async function escalateSpam(message: Message, messages: Message[]): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  await deleteMessages(message.channel, messages);

  const warnKey = `${guild.id}:${message.author.id}`;
  const lastWarn = warnedAt.get(warnKey) ?? 0;
  if (Date.now() - lastWarn > WARN_TTL_MS) {
    warnedAt.set(warnKey, Date.now());
    await warnEphemeral(message.channel, `**${message.author}** — avertissement anti-spam. Prochain dépassement = mute.`);
    return;
  }

  warnedAt.delete(warnKey);
  const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;
  await member
    .timeout(MUTE_MS, "Anti-spam (Fusion Protect)")
    .catch(() => member.kick("Anti-spam (Fusion Protect)").catch(() => null));
}

export async function execute(message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild || !message.author || message.author.bot) return;

  const cfg = getProtectConfig(guild.id);
  const botId = guild.client.user?.id ?? "";
  const exempt = message.author.id === botId || isWhitelisted(guild.id, guild.ownerId, message.author.id);

  // ---- Anti-spam : messages rapides + mentions massives ----
  if (cfg.antispam.enabled && !exempt && !cfg.antispam.allowedChannels.includes(message.channelId)) {
    const limits = getLimits("antispam", false);
    const key = `${message.channelId}:${message.author.id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { count: 0, messages: [], timer: null };
      buckets.set(key, bucket);
      bucket.timer = setTimeout(() => buckets.delete(key), limits.windowMs);
    }
    bucket.count += 1;
    bucket.messages.push(message);

    const mentionCount = message.mentions.users.size + message.mentions.roles.size;
    const overLimit = bucket.count > limits.limit || mentionCount >= MENTION_LIMIT;
    if (overLimit) {
      buckets.delete(key);
      if (bucket.timer) clearTimeout(bucket.timer);
      const messages = mentionCount >= MENTION_LIMIT ? [message] : bucket.messages;
      await escalateSpam(message, messages);

      // Auto-raidmode : spam massif multi-comptes → on verrouille tout
      if (cfg.antispam.autoraidmode && trackSpamSignal(guild.id, message.author.id)) {
        await enableRaidmode(guild, "spam massif");
      }
    }
  }

  // ---- Modération automatique : liens / invitations ----
  if (exempt) return;
  const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  if (isAdmin) return;

  const content = message.content ?? "";
  if (
    cfg.automod.links.enabled &&
    cfg.automod.links.channels.includes(message.channelId) &&
    LINK_RE.test(content)
  ) {
    await message.delete().catch(() => null);
    await warnEphemeral(message.channel, `**${message.author}** — les liens sont interdits dans ce salon.`);
    return;
  }
  if (
    cfg.automod.invites.enabled &&
    cfg.automod.invites.channels.includes(message.channelId) &&
    INVITE_RE.test(content)
  ) {
    await message.delete().catch(() => null);
    await warnEphemeral(message.channel, `**${message.author}** — les invitations Discord sont interdites dans ce salon.`);
  }
}
