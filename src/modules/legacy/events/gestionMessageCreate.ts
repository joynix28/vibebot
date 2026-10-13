import { Events, ChannelType, PermissionFlagsBits } from "discord.js";
import type { Message, Guild, TextBasedChannel, SendableChannels } from "discord.js";
import { FLAGS_V2, BLUE, panel, textBlock, okPanel } from "../../../core/ui.ts";
import { getSticky, removeSticky } from "../func/db-gestion.ts";
import { postSticky } from "../commands/sticky.ts";
import { getAfk, removeAfk } from "../func/db-gestion.ts";
import {
  listModmailGuilds,
  getModmailConfig,
  getOpenTicket,
  createTicket,
  setTicketChannel,
  getTicketByChannel,
} from "../func/db-gestion.ts";

export const name = Events.MessageCreate;

// ---------------------------------------------------------------------------
// Sticky : republie le message collant s'il n'est plus le dernier du salon.
// ---------------------------------------------------------------------------

async function handleSticky(message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  const sticky = getSticky(guild.id, message.channelId);
  if (!sticky || message.id === sticky.last_id) return;
  if (sticky.last_id) {
    await message.channel.messages.delete(sticky.last_id).catch(() => {});
  }
  const sentId = await postSticky(guild, message.channelId, sticky.message);
  if (!sentId) {
    // Salon inaccessible : on retire le sticky pour éviter les erreurs en boucle.
    removeSticky(guild.id, message.channelId);
  }
}

// ---------------------------------------------------------------------------
// AFK : retire le statut quand l'utilisateur parle, prévient sur mention.
// ---------------------------------------------------------------------------

async function handleAfk(message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild) return;

  if (removeAfk(guild.id, message.author.id)) {
    const notice = await message
      .reply({ components: [okPanel(`👋 Bon retour <@${message.author.id}> ! Ton statut AFK a été retiré.`)], flags: FLAGS_V2 })
      .catch(() => null);
    if (notice) setTimeout(() => notice.delete().catch(() => {}), 8000);
  }

  if (message.mentions.users.size === 0) return;
  const afks: { id: string; reason: string }[] = [];
  for (const user of message.mentions.users.values()) {
    if (user.bot || user.id === message.author.id) continue;
    const afk = getAfk(guild.id, user.id);
    if (afk) afks.push({ id: user.id, reason: afk.reason });
  }
  if (afks.length === 0) return;
  const lines = afks.map((a) => `> <@${a.id}> est actuellement **AFK** : *${a.reason}*`).join("\n");
  if (!message.channel.isSendable()) return;
  await message.channel.send({ components: [panel([textBlock(`## 💤 AFK\n${lines}`)], BLUE)], flags: FLAGS_V2 }).catch(() => {});
}

// ---------------------------------------------------------------------------
// ModMail : MPs au bot ↔ salons tickets.
// ---------------------------------------------------------------------------

/** Serveurs où l'utilisateur peut utiliser le ModMail (configuré + membre). */
async function findModmailGuilds(message: Message): Promise<Guild[]> {
  const guilds: Guild[] = [];
  for (const guildId of listModmailGuilds()) {
    const guild = await message.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;
    const member = await guild.members.fetch(message.author.id).catch(() => null);
    if (member) guilds.push(guild);
  }
  return guilds.sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function sendModmailLog(guild: Guild, text: string): Promise<void> {
  const cfg = getModmailConfig(guild.id);
  if (!cfg.log_channel) return;
  const channel = (await guild.channels.fetch(cfg.log_channel).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isSendable()) return;
  await channel.send({ components: [panel([textBlock(text)], BLUE)], flags: FLAGS_V2 }).catch(() => {});
}

/** Un MP reçu → relayé vers le salon ticket (créé si besoin). */
async function handleModmailDm(message: Message): Promise<void> {
  const guilds = await findModmailGuilds(message);
  if (guilds.length === 0) return;
  const guild = guilds[0]!;
  if (guilds.length > 1) {
    await message.author
      .send(`> *Plusieurs serveurs ont le ModMail activé ; ton message a été envoyé à **${guild.name}**.*`)
      .catch(() => {});
  }

  const ticket = getOpenTicket(guild.id, message.author.id);
  let channel: SendableChannels | null = null;
  if (ticket?.channel_id) {
    const fetched = await guild.channels.fetch(ticket.channel_id).catch(() => null);
    if (fetched?.isSendable()) channel = fetched;
  }
  if (!channel) {
    const cfg = getModmailConfig(guild.id);
    const category = cfg.category_id ? await guild.channels.fetch(cfg.category_id).catch(() => null) : null;
    const safeName = message.author.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "ticket";
    const created = await guild.channels
      .create({
        name: `modmail-${safeName}`,
        type: ChannelType.GuildText,
        parent: category && category.type === ChannelType.GuildCategory ? category.id : undefined,
        permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
        reason: `ModMail ouvert par ${message.author.tag}`,
      })
      .catch(() => null);
    if (!created?.isSendable()) return;
    channel = created;
    const ticketId = createTicket(guild.id, message.author.id);
    setTicketChannel(ticketId, created.id);
    await created
      .send({
        components: [
          panel(
            [
              textBlock(
                `## 📬 ModMail — ticket #${ticketId}\n` +
                  `> *Conversation avec ${message.author} (\`${message.author.tag} | ${message.author.id}\`).*\n` +
                  `> *Réponds dans ce salon pour envoyer un message au membre.*\n` +
                  `> *Ferme avec \`/modmail close\`.*`
              ),
            ],
            BLUE
          ),
        ],
        flags: FLAGS_V2,
      })
      .catch(() => {});
    await sendModmailLog(guild, `📬 Ticket ModMail #${ticketId} ouvert par <@${message.author.id}>.`);
  }

  const files = [...message.attachments.values()].map((a) => a.url);
  const body = message.content?.trim();
  const content = body
    ? `**${message.author.tag} :**\n${body}`
    : files.length > 0
      ? `**${message.author.tag} :** *(pièce jointe)*`
      : null;
  if (content || files.length > 0) {
    await channel.send({ content: content ?? undefined, files: files.length > 0 ? files : undefined }).catch(() => {});
  }
}

/** Un message du staff dans un salon ticket → relayé en MP au membre. */
async function handleModmailGuild(message: Message): Promise<void> {
  const guild = message.guild;
  if (!guild) return;
  const ticket = getTicketByChannel(message.channelId);
  if (!ticket || ticket.guild_id !== guild.id) return;
  const user = await message.client.users.fetch(ticket.user_id).catch(() => null);
  if (!user) return;
  const files = [...message.attachments.values()].map((a) => a.url);
  const body = message.content?.trim();
  const content = body
    ? `**📩 ${guild.name} (staff) :**\n${body}`
    : files.length > 0
      ? `**📩 ${guild.name} (staff) :** *(pièce jointe)*`
      : null;
  if (content || files.length > 0) {
    await user.send({ content: content ?? undefined, files: files.length > 0 ? files : undefined }).catch(() => {});
  }
}

export async function execute(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.guild) {
    await handleModmailDm(message).catch(() => {});
    return;
  }
  await handleSticky(message).catch(() => {});
  await handleAfk(message).catch(() => {});
  await handleModmailGuild(message).catch(() => {});
}
