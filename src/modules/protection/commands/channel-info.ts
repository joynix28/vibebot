import { ChannelType, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, field, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("channel-info")
  .setDescription("Afficher les informations sur un salon du serveur.")
  .addChannelOption((o) => o.setName("salon").setDescription("Salon à inspecter (défaut : salon actuel)."));

function typeLabel(t: ChannelType): string {
  switch (t) {
    case ChannelType.GuildText:
      return "Salon textuel";
    case ChannelType.GuildVoice:
      return "Salon vocal";
    case ChannelType.GuildCategory:
      return "Catégorie";
    case ChannelType.GuildAnnouncement:
      return "Salon d'annonces";
    case ChannelType.AnnouncementThread:
    case ChannelType.PublicThread:
    case ChannelType.PrivateThread:
      return "Fil";
    case ChannelType.GuildStageVoice:
      return "Salon de conférence";
    case ChannelType.GuildForum:
      return "Forum";
    case ChannelType.GuildMedia:
      return "Salon média";
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
  const channel = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!channel) {
    await replyErr(interaction, "❌ Salon invalide.");
    return;
  }
  const slowmode = "rateLimitPerUser" in channel ? (channel.rateLimitPerUser as number) : 0;
  const slowText =
    slowmode === 0
      ? "Désactivé"
      : slowmode >= 3600
        ? `${Math.floor(slowmode / 3600)}h`
        : slowmode >= 60
          ? `${Math.floor(slowmode / 60)}m`
          : `${slowmode}s`;
  const parent = "parent" in channel && channel.parent ? `${channel.parent}` : "Aucune";
  const nsfw = "nsfw" in channel && (channel.nsfw as boolean) ? "🔞 Salon soumis à une limite d'âge" : "Par défaut";

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`# 📚 ${channel.name}`),
          sepBlock(),
          textBlock(
            [
              field("ID", channel.id),
              `> **Nom :** ${channel} \`${channel.name}\``,
              channel.createdTimestamp ? field("Créé le", ts(channel.createdTimestamp)) : "> **Créé le :** *inconnu*",
              `> **Catégorie :** ${parent}`,
            ].join("\n")
          ),
          sepBlock(),
          textBlock(
            [
              `> **Type :** ${typeLabel(channel.type)}`,
              `> **Mode lent :** ${slowText}`,
              `> **NSFW :** ${nsfw}`,
            ].join("\n")
          ),
        ],
        BLURPLE
      ),
    ],
    flags: FLAGS_V2,
  });
}
