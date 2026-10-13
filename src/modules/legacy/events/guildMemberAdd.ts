import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import {
  applyInviteVars,
  defaultJoinMessage,
  getInviteConfig,
  recordInvite,
} from "../func/db.ts";
import { detectUsedInvite } from "../func/inviteCache.ts";

// Tracking des invitations à l'arrivée d'un membre, repris du bot legacy
// (Events/Invitations/invitesMemberAdd.js) : détecte l'invitation utilisée
// (via guild.invites.fetch comparé au cache) et envoie le message de
// bienvenue configuré.

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  const guild = member.guild;
  if (!guild) return;
  const cfg = getInviteConfig(guild.id);
  if (!cfg.enabled) return;

  let inviterId: string | null = null;
  try {
    const invite = await detectUsedInvite(guild);
    if (invite?.inviterId && invite.inviterId !== member.id && !member.user.bot) {
      inviterId = invite.inviterId;
      recordInvite(guild.id, invite.inviterId, member.id);
    }
  } catch (err) {
    console.error("[legacy] détection d'invitation", err);
  }

  if (!cfg.join_channel) return;
  const channel = await guild.channels.fetch(cfg.join_channel).catch(() => null);
  if (!channel?.isSendable()) return;

  const text = applyInviteVars(cfg.join_message, defaultJoinMessage(), {
    user: `<@${member.id}>`,
    server: guild.name,
    count: guild.memberCount,
    inviter: inviterId ? `<@${inviterId}>` : "*inconnu*",
  });
  await channel.send({ content: text }).catch(() => {});
}
