import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  FLAGS_V2,
  field,
  linkBtn,
  actionRow,
  mediaBlock,
  panel,
  sepBlock,
  textBlock,
} from "../../../core/ui.ts";
import { BLURPLE, needGuild } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("server-info")
  .setDescription("Afficher les informations sur le serveur.");

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}> (<t:${s}:R>)`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const owner = await guild.fetchOwner().catch(() => null);
  const online = guild.members.cache.filter((m) => ["online", "idle", "dnd"].includes(m.presence?.status ?? "")).size;
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;
  const textCh = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
  const voiceCh = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;

  const blocks = [
    textBlock(`# 🖥️ ${guild.name}`),
    sepBlock(),
    textBlock(
      [
        field("ID", guild.id),
        field("Créé le", ts(guild.createdTimestamp)),
        `> **Propriétaire :** ${owner ? `${owner.user} \`@${owner.user.username}\`` : "*inconnu*"}`,
      ].join("\n")
    ),
    sepBlock(),
    textBlock(
      [
        `> **Membres :** ${guild.memberCount} (${online} en ligne) — ${humans} humains, ${bots} robots`,
        `> **Boosts :** niveau ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
        `> **Salons :** ${guild.channels.cache.size} (${textCh} textuels, ${voiceCh} vocaux)`,
        `> **Rôles :** ${guild.roles.cache.size}`,
        `> **Emojis :** ${guild.emojis.cache.size}`,
      ].join("\n")
    ),
  ];
  const icon = guild.iconURL({ size: 256 });
  if (icon) blocks.push(mediaBlock([{ url: icon, description: "Icône du serveur" }]));

  const rows = [];
  const links = actionRow();
  let hasLink = false;
  if (icon) {
    links.addComponents(linkBtn(icon, "Icône"));
    hasLink = true;
  }
  const banner = guild.bannerURL({ size: 1024 });
  if (banner) {
    links.addComponents(linkBtn(banner, "Bannière"));
    hasLink = true;
  }
  if (hasLink) rows.push(links);

  await interaction.reply({ components: [panel(blocks, BLURPLE), ...rows], flags: FLAGS_V2 });
}
