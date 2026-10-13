import { Events } from "discord.js";
import type { Message } from "discord.js";
import { addXp, getXp } from "../func/db.ts";
import { levelFromXp } from "../func/xp.ts";

// Gain d'XP par message, repris du bot legacy (Events/Levels/levelsMessageCreate.js) :
// +15 à 25 XP par message, cooldown de 60 s par utilisateur, annonce de level-up.

const COOLDOWN_MS = 60_000;
const XP_MIN = 15;
const XP_MAX = 25;

const cooldowns = new Map<string, number>();

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const last = cooldowns.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return;
  cooldowns.set(key, now);

  // Évite une fuite mémoire : purge les entrées expirées quand la map grossit.
  if (cooldowns.size > 5000) {
    for (const [k, ts] of cooldowns) {
      if (now - ts >= COOLDOWN_MS) cooldowns.delete(k);
    }
  }

  const amount = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
  const before = getXp(message.guild.id, message.author.id);
  const oldLevel = levelFromXp(before.xp);
  const row = addXp(message.guild.id, message.author.id, amount);
  const newLevel = levelFromXp(row.xp);

  if (newLevel > oldLevel && message.channel.isSendable()) {
    await message.channel
      .send(`🎉 <@${message.author.id}> vient de passer **niveau ${newLevel}** !`)
      .catch(() => {});
  }
}
