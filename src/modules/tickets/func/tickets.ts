import {
  ButtonStyle,
  ChannelType,
  FileBuilder,
  PermissionFlagsBits,
} from "discord.js";
import type {
  Guild,
  GuildMember,
  MessageComponentInteraction,
  TextChannel,
  Message,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  GOLD,
  actionRow,
  button,
  errPanel,
  okPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  allSupportRoles,
  closeTicket,
  createTicket,
  deleteTicket,
  getLogChannel,
  getOpenTicketByUser,
  getPanel,
  getTicket,
  getTicketByChannel,
  panelSelectOptions,
  panelSupportRoles,
  setTicketChannel,
  type Ticket,
  type TicketPanel,
} from "./db.ts";

// Helpers partagés du module tickets : permissions, validation,
// création de salons, transcripts. (Sécurité : vérifie toujours
// creator_id et les rôles support avant toute action sensible.)

/** Le membre fait-il partie du staff tickets ? (ManageChannels ou rôle support d'un panel) */
export function isStaff(member: GuildMember, guildId: string): boolean {
  if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  const roles = allSupportRoles(guildId);
  if (roles.length === 0) return false;
  return roles.some((r) => member.roles.cache.has(r));
}

/** Le membre peut-il gérer ce ticket ? (staff, ou créateur du ticket) */
export function canManageTicket(member: GuildMember, ticket: Ticket, guildId: string): boolean {
  if (member.id === ticket.creator_id) return true;
  return isStaff(member, guildId);
}

/** Nom de salon Discord valide (minuscules, tirets, max 90). */
export function sanitizeChannelName(name: string): string {
  const clean = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `ticket-${clean || "sans-nom"}`.slice(0, 90);
}

/** Durée lisible en français : "2 j 3 h", "45 min", "30 s". */
export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${m % 60} min`;
  const d = Math.floor(h / 24);
  return `${d} j ${h % 24} h`;
}

export function priorityLabel(p: Ticket["priority"]): string {
  return p === "haute" ? "🔴 Haute" : p === "basse" ? "🟢 Basse" : "🟡 Normale";
}

/** Vérifie qu'un ticket existe, appartient au serveur et est ouvert. */
export function checkTicket(guildId: string, ticketId: number): Ticket | null {
  const t = getTicket(ticketId);
  if (!t || t.guild_id !== guildId || t.status !== "open") return null;
  return t;
}

/** Récupère le ticket ouvert du salon courant (doit appartenir au serveur). */
export function ticketOfChannel(guildId: string, channelId: string): Ticket | null {
  const t = getTicketByChannel(channelId);
  if (!t || t.guild_id !== guildId || t.status !== "open") return null;
  return t;
}

// ---------------------------------------------------------------------------
// Création d'un ticket
// ---------------------------------------------------------------------------

export interface TicketCreation {
  ticket: Ticket;
  channel: TextChannel;
}

/**
 * Crée le salon privé du ticket (créateur + rôles support du panel),
 * enregistre le ticket en base et poste le message de bienvenue V2.
 * Retourne null si la création échoue (le ticket DB est nettoyé).
 */
export async function createTicketChannel(
  guild: Guild,
  panelRow: TicketPanel,
  member: GuildMember,
  topic: string
): Promise<TicketCreation | null> {
  const ticket = createTicket(guild.id, member.id, topic);
  const supportRoles = panelSupportRoles(panelRow);

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    ...supportRoles.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    })),
  ];

  const channel = (await guild.channels
    .create({
      name: sanitizeChannelName(`${member.displayName}-${ticket.id}`),
      type: ChannelType.GuildText,
      parent: panelRow.category_id ?? undefined,
      permissionOverwrites: overwrites,
      topic: `Ticket #${ticket.id} — ${topic}`.slice(0, 1024),
    })
    .catch(() => null)) as TextChannel | null;

  if (!channel) {
    deleteTicket(ticket.id);
    return null;
  }
  setTicketChannel(ticket.id, channel.id);

  await channel
    .send({
      components: [
        panel(
          [
            textBlock(
              `# 🎫 Ticket #${ticket.id}\n` +
                `> Bienvenue <@${member.id}> ! Décris ton problème, l'équipe va te répondre.\n` +
                `> **Sujet :** ${topic || "*non précisé*"}\n` +
                `> **Priorité :** ${priorityLabel(ticket.priority)}`
            ),
            sepBlock(),
            textBlock(
              `> **Ouvert par :** <@${member.id}>\n` +
                `> **Pris en charge par :** *personne pour le moment*`
            ),
          ],
          BLUE
        ),
        actionRow(
          button(`ticket:close:${ticket.id}`, "Fermer", ButtonStyle.Secondary, "🔒"),
          button(`ticket:claim:${ticket.id}`, "Prendre en charge", ButtonStyle.Primary, "🙋")
        ),
      ],
      flags: FLAGS_V2,
    })
    .catch(() => {});

  return { ticket: { ...ticket, channel_id: channel.id }, channel };
}

/** Verrouille le salon d'un ticket fermé (lecture seule pour le créateur). */
export async function lockTicketChannel(guild: Guild, ticket: Ticket): Promise<void> {
  if (!ticket.channel_id) return;
  const ch = await guild.channels.fetch(ticket.channel_id).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return;
  await ch.permissionOverwrites
    .edit(ticket.creator_id, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true })
    .catch(() => {});
  await ch
    .send({ components: [panel([textBlock(`🔒 Ce ticket est fermé. Le salon sera supprimé sous peu.`)], BLUE)], flags: FLAGS_V2 })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

const TOKEN_RE = /[\w-]{24}\.[\w-]{6}\.[\w-]{27}/g;

/** Nettoie une ligne de transcript (ne jamais laisser fuiter un token). */
function cleanLine(text: string): string {
  return text.replace(TOKEN_RE, "[contenu masqué]").slice(0, 1500);
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Génère le transcript Markdown d'un salon ticket (ordre chronologique).
 * Ne lit QUE ce salon : aucun contenu extérieur n'est inclus.
 */
export async function buildTranscript(channel: TextChannel, ticket: Ticket): Promise<string> {
  const lines: string[] = [
    `# Transcript — Ticket #${ticket.id}`,
    ``,
    `- **Serveur :** ${channel.guild.name}`,
    `- **Salon :** #${channel.name}`,
    `- **Ouvert par :** <@${ticket.creator_id}>`,
    `- **Pris en charge par :** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : "*personne*"}`,
    `- **Priorité :** ${ticket.priority}`,
    `- **Sujet :** ${ticket.topic || "*non précisé*"}`,
    `- **Ouvert le :** ${fmtDate(ticket.created_at)}`,
    `- **Fermé le :** ${ticket.closed_at ? fmtDate(ticket.closed_at) : "*en cours*"}`,
    ``,
    `---`,
    ``,
  ];

  // Pagination (100 messages / appel), cap à 500 messages.
  let collected: Message[] = [];
  let before: string | undefined;
  for (let i = 0; i < 5; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    collected = [...batch.values(), ...collected];
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const m of collected) {
    const author = `${m.author.tag}${m.author.bot ? " [BOT]" : ""}`;
    const content = m.content?.trim() ? cleanLine(m.content) : "";
    const atts = m.attachments.map((a) => `[pièce jointe : ${a.name ?? "fichier"}](${a.url})`).join(" ");
    const body = [content, atts].filter(Boolean).join(" ") || "*message vide*";
    lines.push(`**[${fmtDate(m.createdTimestamp)}] ${author} :** ${body}`);
  }
  if (collected.length === 0) lines.push("*Aucun message dans ce ticket.*");
  lines.push(``, `---`, `*Transcript généré automatiquement.*`);
  return lines.join("\n");
}

/**
 * Envoie le transcript dans le salon de logs configuré (si présent).
 * Retourne true si envoyé.
 */
export async function sendTranscriptToLog(guild: Guild, ticket: Ticket): Promise<boolean> {
  const logId = getLogChannel(guild.id);
  if (!logId) return false;
  const logCh = await guild.channels.fetch(logId).catch(() => null);
  if (!logCh || !logCh.isTextBased() || !logCh.isSendable()) return false;

  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;
  if (!channel || channel.type !== ChannelType.GuildText) return false;

  const md = await buildTranscript(channel, ticket);
  const filename = `transcript-ticket-${ticket.id}.md`;
  await logCh
    .send({
      components: [
        panel(
          [
            textBlock(
              `# 📄 Transcript — Ticket #${ticket.id}\n` +
                `> **Ouvert par :** <@${ticket.creator_id}>\n` +
                `> **Pris en charge par :** ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : "*personne*"}`
            ),
          ],
          GREEN
        ),
        new FileBuilder().setURL(`attachment://${filename}`),
      ],
      files: [{ attachment: Buffer.from(md, "utf-8"), name: filename }],
      flags: FLAGS_V2,
    })
    .catch(() => {});
  return true;
}

/** Marque le ticket comme fermé en base + verrouille le salon. */
export async function finalizeClose(guild: Guild, ticket: Ticket): Promise<void> {
  closeTicket(ticket.id);
  await lockTicketChannel(guild, { ...ticket, status: "closed", closed_at: Date.now() });
}

/** Supprime le salon d'un ticket après un délai (ms). */
export function scheduleChannelDelete(guild: Guild, channelId: string, ticketId: number, delayMs: number): void {
  setTimeout(async () => {
    const ch = await guild.channels.fetch(channelId).catch(() => null);
    if (ch && "delete" in ch && typeof (ch as { delete?: unknown }).delete === "function") {
      await (ch as unknown as { delete: (reason?: string) => Promise<unknown> })
        .delete(`Ticket #${ticketId} fermé`)
        .catch(() => {});
    }
  }, delayMs).unref?.();
}

// ---------------------------------------------------------------------------
// Validation des entrées
// ---------------------------------------------------------------------------

export const LIMITS = {
  panelTitle: 100,
  panelDescription: 1000,
  topic: 500,
  rename: 90,
  selectOptions: 25,
  selectOptionLen: 50,
} as const;

/** Découpe une chaîne "a, b, c" en options validées (longueur + nombre max). */
export function parseSelectOptions(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().slice(0, LIMITS.selectOptionLen))
    .filter((s) => s.length > 0)
    .slice(0, LIMITS.selectOptions);
}

/** Vérifie qu'un salon existe et est une catégorie. */
export async function resolveCategory(guild: Guild, id: string | null): Promise<string | null> {
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  return ch && ch.type === ChannelType.GuildCategory ? ch.id : null;
}

/** Vérifie qu'un salon texte existe et est accessible. */
export async function resolveTextChannel(guild: Guild, id: string | null): Promise<string | null> {
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  return ch && ch.type === ChannelType.GuildText ? ch.id : null;
}

/** Vérifie qu'un rôle existe sur le serveur. */
export async function resolveRole(guild: Guild, id: string | null): Promise<string | null> {
  if (!id) return null;
  const role = await guild.roles.fetch(id).catch(() => null);
  return role ? role.id : null;
}

/** Étoiles pour le feedback : "★★★★☆ (4/5)". */
export function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n) + ` (${n}/5)`;
}

/** Réponse d'erreur éphémère V2 (boutons / menus). */
export async function denyInteraction(interaction: MessageComponentInteraction, msg: string): Promise<void> {
  const payload = { components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL };
  if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
}

// ---------------------------------------------------------------------------
// Ouverture de ticket depuis un panel (bouton `ticket-panel:open:*`,
// menu `ticket-panel:menu:*` — gérés par la commande `ticket-panel`)
// ---------------------------------------------------------------------------

/** Bouton "Créer un ticket" d'un panel. */
export async function handlePanelOpen(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  panelId: number
): Promise<void> {
  const p = getPanel(panelId);
  if (!p || p.guild_id !== guild.id) {
    await denyInteraction(interaction, "Ce panneau n'existe plus.");
    return;
  }
  const existing = getOpenTicketByUser(guild.id, member.id);
  if (existing?.channel_id) {
    await denyInteraction(interaction, `Tu as déjà un ticket ouvert : <#${existing.channel_id}>`);
    return;
  }
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
  const created = await createTicketChannel(guild, p, member, "");
  if (!created) {
    await interaction.editReply({ components: [errPanel("Impossible de créer le salon ticket (permissions du bot ?).")] }).catch(() => {});
    return;
  }
  await interaction
    .editReply({ components: [okPanel(`✅ Ton ticket a été créé : <#${created.channel.id}>`)] })
    .catch(() => {});
}

/** Menu déroulant d'un panel : la valeur choisie devient le sujet du ticket. */
export async function handlePanelMenu(
  interaction: MessageComponentInteraction,
  guild: Guild,
  member: GuildMember,
  panelId: number,
  value: string | undefined
): Promise<void> {
  const p = getPanel(panelId);
  if (!p || p.guild_id !== guild.id) {
    await denyInteraction(interaction, "Ce panneau n'existe plus.");
    return;
  }
  const options = panelSelectOptions(p);
  const idx = Number(value);
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
    await denyInteraction(interaction, "Choix invalide.");
    return;
  }
  const topic = options[idx] as string;
  const existing = getOpenTicketByUser(guild.id, member.id);
  if (existing?.channel_id) {
    await denyInteraction(interaction, `Tu as déjà un ticket ouvert : <#${existing.channel_id}>`);
    return;
  }
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL }).catch(() => {});
  const created = await createTicketChannel(guild, p, member, topic);
  if (!created) {
    await interaction.editReply({ components: [errPanel("Impossible de créer le salon ticket (permissions du bot ?).")] }).catch(() => {});
    return;
  }
  await interaction
    .editReply({ components: [okPanel(`✅ Ton ticket **${topic}** a été créé : <#${created.channel.id}>`)] })
    .catch(() => {});
}

export { GOLD };
