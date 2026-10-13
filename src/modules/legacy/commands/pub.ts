import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  getPubChannel,
  setPubChannel,
  getPubCount,
  topPub,
  pubRank,
} from "../func/db-plus.ts";

export const data = new SlashCommandBuilder()
  .setName("pub")
  .setDescription("Gère le salon de pubs et le classement des partenaires.")
  .addSubcommand((s) =>
    s
      .setName("config")
      .setDescription("Définit le salon où les pubs sont comptabilisées.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon de pubs.").setRequired(true).addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("stats")
      .setDescription("Affiche le classement des pubs.")
      .addUserOption((o) => o.setName("membre").setDescription("Voir les stats d'un membre précis."))
  );

const MEDALS = ["🥇", "🥈", "🥉"];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "config") {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const salon = interaction.options.getChannel("salon", true);
    setPubChannel(guild.id, salon.id);
    await interaction.reply({ components: [okPanel(`📢 Les pubs postées dans <#${salon.id}> seront comptabilisées.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // stats
  const channelId = getPubChannel(guild.id);
  if (!channelId) {
    await interaction.reply({ components: [errPanel("Aucun salon de pubs configuré. Utilise `/pub config`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const memberOpt = interaction.options.getUser("membre");
  if (memberOpt) {
    const count = getPubCount(guild.id, memberOpt.id);
    const rank = pubRank(guild.id, memberOpt.id);
    const rankLine = rank > 0 ? `\n**Rang :** #${rank}` : "";
    await interaction.reply({
      components: [
        panel(
          [textBlock(`## 📢 Stats de pub — ${memberOpt.username}\n**Pubs postées :** \`${count}\`${rankLine}`)],
          BLUE
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const top = topPub(guild.id, 10);
  if (top.length === 0) {
    await interaction.reply({ components: [errPanel("Aucune pub comptabilisée pour le moment.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = top.map((s, i) => {
    const medal = MEDALS[i] ?? `\`${i + 1}.\``;
    return `${medal} <@${s.user_id}> — **${s.count}** pub(s)`;
  });
  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`## 📢 Classement des pubs\n*Salon : <#${channelId}>*`),
          sepBlock(false),
          textBlock(lines.join("\n")),
        ],
        GOLD
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
