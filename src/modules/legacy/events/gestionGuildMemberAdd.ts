import { Events } from "discord.js";
import type { GuildMember, TextBasedChannel } from "discord.js";
import { getWelcome } from "../func/db-gestion.ts";
import { renderWelcome, sendWelcomeMessage, DEFAULT_JOIN } from "../commands/welcome.ts";

// Message de bienvenue configuré via /welcome (cohabite avec le listener
// d'invitations de l'autre agent, qui gère son propre salon de logs).

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  const cfg = getWelcome(member.guild.id);
  if (!cfg?.channelId) return;
  const channel = (await member.guild.channels.fetch(cfg.channelId).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isTextBased()) return;
  try {
    await sendWelcomeMessage(channel, renderWelcome(cfg.join ?? DEFAULT_JOIN, member), cfg.embed !== false);
  } catch {
    /* salon inaccessible */
  }
}
