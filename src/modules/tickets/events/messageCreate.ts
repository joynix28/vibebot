import { ChannelType, Events } from "discord.js";
import type { Message } from "discord.js";
import { isModuleEnabled } from "../../../core/db.ts";
import { getTicketByChannel, markFirstResponse } from "../func/db.ts";
import { isStaff } from "../func/tickets.ts";

// Marque l'heure de la première réponse du staff dans un ticket
// (sert aux statistiques de temps de réponse).

export const name = Events.MessageCreate;

export async function execute(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  if (!isModuleEnabled(message.guild.id, "tickets")) return;
  if (message.channel.type !== ChannelType.GuildText) return;

  const ticket = getTicketByChannel(message.channel.id);
  if (!ticket || ticket.guild_id !== message.guild.id) return;
  if (ticket.status !== "open" || ticket.first_response_at !== null) return;
  if (message.author.id === ticket.creator_id) return;

  const member = message.member;
  if (!member) return;
  if (!isStaff(member, message.guild.id)) return;

  markFirstResponse(ticket.id);
}
