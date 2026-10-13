import { Events } from "discord.js";
import type { GuildMember, TextBasedChannel } from "discord.js";
import { getWelcome } from "../func/db-gestion.ts";
import { renderWelcome, sendWelcomeMessage, DEFAULT_LEAVE } from "../commands/welcome.ts";

// Message d'au revoir configuré via /welcome (cohabite avec le listener
// d'invitations de l'autre agent, qui gère son propre salon de logs).

export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember): Promise<void> {
  const cfg = getWelcome(member.guild.id);
  if (!cfg?.channelId) return;
  const channel = (await member.guild.channels.fetch(cfg.channelId).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isTextBased()) return;
  try {
    await sendWelcomeMessage(channel, renderWelcome(cfg.leave ?? DEFAULT_LEAVE, member), cfg.embed !== false);
  } catch {
    /* salon inaccessible */
  }
}
