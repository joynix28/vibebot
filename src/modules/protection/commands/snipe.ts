import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { getSnipe } from "../func/db.ts";
import { BLURPLE, hasPerm, needGuild, replyErr, resolveGuildChannel } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("snipe")
  .setDescription("Afficher le dernier message supprimé du salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addChannelOption((o) =>
    o
      .setName("salon")
      .setDescription("Salon à inspecter (défaut : salon actuel).")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
  );

interface SnipeData {
  content?: string;
  author?: { id?: string; username?: string; avatar?: string };
  username?: string;
  avatarURL?: string;
  createdAt?: number;
  createdTimestamp?: number;
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}> (<t:${s}:R>)`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Gérer les messages**.");
    return;
  }
  const channel = resolveGuildChannel(guild, interaction.options.getChannel("salon")?.id ?? interaction.channelId);
  if (!channel || !channel.isTextBased()) {
    await replyErr(interaction, "❌ Salon invalide.");
    return;
  }

  const raw = getSnipe(guild.id, channel.id);
  if (!raw) {
    await replyErr(interaction, "❌ Aucun message supprimé enregistré dans ce salon.");
    return;
  }

  let data: SnipeData;
  try {
    data = JSON.parse(raw) as SnipeData;
  } catch {
    data = { content: raw };
  }

  const content = (data.content ?? "*contenu indisponible*").slice(0, 3500);
  const username = data.author?.username ?? data.username ?? "Inconnu";
  const authorId = data.author?.id;
  const created = data.createdAt ?? data.createdTimestamp;

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`# 📸 Snipe — ${channel}`),
          sepBlock(),
          textBlock(
            [
              `> **Auteur :** ${authorId ? `<@${authorId}>` : ""} \`${username}\``,
              created ? `> **Supprimé :** ${ts(created)}` : null,
            ]
              .filter((l): l is string => l !== null)
              .join("\n")
          ),
          sepBlock(),
          textBlock(content || "*message vide*"),
        ],
        BLURPLE
      ),
    ],
    flags: FLAGS_V2,
  });
}
