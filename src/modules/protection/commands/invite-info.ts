import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, actionRow, field, linkBtn, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("invite-info")
  .setDescription("Afficher les informations sur une invitation Discord.")
  .addStringOption((o) => o.setName("invitation").setDescription("Lien ou code d'invitation.").setRequired(true));

function typeLabel(t: ChannelType | undefined): string {
  switch (t) {
    case ChannelType.GuildText:
      return "Salon textuel";
    case ChannelType.GuildVoice:
      return "Salon vocal";
    case ChannelType.GuildCategory:
      return "Catégorie";
    case ChannelType.GuildAnnouncement:
      return "Salon d'annonces";
    case ChannelType.GuildStageVoice:
      return "Salon de conférence";
    default:
      return "Autre";
  }
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}> (<t:${s}:R>)`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const code = interaction.options.getString("invitation", true).trim();
  const invite = await interaction.client.fetchInvite(code).catch(() => null);
  if (!invite || !invite.guild) {
    await replyErr(interaction, "❌ Cette invitation est invalide.");
    return;
  }
  const g = invite.guild;
  const blocks = [
    textBlock(`# 🔗 ${g.name}`),
    sepBlock(),
    textBlock(
      [
        field("ID du serveur", g.id),
        g.createdTimestamp ? field("Serveur créé le", ts(g.createdTimestamp)) : null,
        `> **Membres :** ${invite.memberCount ?? "?"} (${invite.presenceCount ?? "?"} en ligne)`,
      ]
        .filter((l): l is string => l !== null)
        .join("\n")
    ),
    sepBlock(),
    textBlock(
      [
        `> **Salon :** ${invite.channel ? `#${invite.channel.name}` : "*inconnu*"} (${typeLabel(invite.channel?.type)})`,
        `> **Code :** \`${invite.code}\``,
        invite.expiresAt ? `> **Expire :** ${ts(invite.expiresAt.getTime())}` : "> **Expiration :** jamais",
        invite.inviter ? `> **Créée par :** ${invite.inviter} \`@${invite.inviter.username}\`` : "> **Créée par :** *inconnu*",
      ].join("\n")
    ),
  ];

  const rows = [];
  const icon = g.iconURL({ size: 256 });
  const banner = g.bannerURL({ size: 1024 });
  if (icon || banner) {
    const links = actionRow();
    if (icon) links.addComponents(linkBtn(icon, "Icône"));
    if (banner) links.addComponents(linkBtn(banner, "Bannière"));
    rows.push(links);
  }

  await interaction.reply({ components: [panel(blocks, BLURPLE), ...rows], flags: FLAGS_V2 });
}
