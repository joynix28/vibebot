import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import {
  applyInviteVars,
  defaultLeaveMessage,
  getInviteConfig,
  markLeft,
} from "../func/db.ts";

// Tracking des départs, repris du bot legacy : marque l'invitation comme
// "parti" (left_flag) et envoie le message de départ configuré.

export const name = Events.GuildMemberRemove;

export async function execute(member: GuildMember): Promise<void> {
  const guild = member.guild;
  if (!guild) return;
  const cfg = getInviteConfig(guild.id);
  if (!cfg.enabled) return;

  const record = markLeft(guild.id, member.id);

  if (!cfg.leave_channel) return;
  const channel = await guild.channels.fetch(cfg.leave_channel).catch(() => null);
  if (!channel?.isSendable()) return;

  const text = applyInviteVars(cfg.leave_message, defaultLeaveMessage(), {
    user: `<@${member.id}>`,
    server: guild.name,
    count: guild.memberCount,
    inviter: record?.inviter_id ? `<@${record.inviter_id}>` : "*inconnu*",
  });
  await channel.send({ content: text }).catch(() => {});
}
