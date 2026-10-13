import {
  SlashCommandBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  okPanel,
  errPanel,
  actionRow,
  button,
  BLUE,
} from "../../../core/ui.ts";
import {
  getServerStats,
  setServerStats,
  clearServerStats,
  refreshServerStats,
  computeStats,
} from "../func/serverstats.ts";

export const data = new SlashCommandBuilder()
  .setName("serverstats")
  .setDescription("📊 Compteurs du serveur : membres, en ligne, boosts.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const CMD = "serverstats";

function hubContainer() {
  const container = panel(
    [textBlock("## 📊 Statistiques du serveur\nDes salons vocaux verrouillés affichent les chiffres en direct.\n\nChoisis une action 👇")],
    BLUE
  );
  container.addActionRowComponents(
    actionRow(
      button(`${CMD}:create`, "Créer les compteurs", ButtonStyle.Primary, "➕"),
      button(`${CMD}:refresh`, "Actualiser", ButtonStyle.Secondary, "🔄"),
      button(`${CMD}:delete`, "Supprimer", ButtonStyle.Danger, "🗑️")
    )
  );
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild || !interaction.isButton()) return;
  const action = interaction.customId.split(":")[1];

  if (action === "create") {
    const existing = getServerStats(guild.id);
    if (existing?.members_channel_id) {
      await interaction.reply({ components: [errPanel("Des compteurs existent déjà. Utilise « Actualiser » ou « Supprimer » d'abord.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    const stats = computeStats(guild);
    const locked = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }];
    try {
      const membersCh = await guild.channels.create({
        name: `👥 Membres : ${stats.members}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: locked,
        reason: "Compteurs serverstats",
      });
      const onlineCh = await guild.channels.create({
        name: `🟢 En ligne : ${stats.online}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: locked,
        reason: "Compteurs serverstats",
      });
      const boostsCh = await guild.channels.create({
        name: `🚀 Boosts : ${stats.boosts}`,
        type: ChannelType.GuildVoice,
        permissionOverwrites: locked,
        reason: "Compteurs serverstats",
      });
      setServerStats(guild.id, {
        members: membersCh.id,
        online: onlineCh.id,
        boosts: boostsCh.id,
      });
      await interaction.editReply({
        components: [okPanel("📊 Compteurs créés ! Ils se mettent à jour automatiquement (arrivées/départs + toutes les 10 minutes).")],
      });
    } catch {
      await interaction.editReply({ components: [errPanel("Impossible de créer les salons. Vérifie mes permissions « Gérer les salons ».")] });
    }
    return;
  }

  if (action === "refresh") {
    const cfg = getServerStats(guild.id);
    if (!cfg) {
      await interaction.reply({ components: [errPanel("Aucun compteur configuré. Crée-les d'abord.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    const ok = await refreshServerStats(guild);
    await interaction.editReply({
      components: [ok ? okPanel("🔄 Compteurs actualisés.") : errPanel("Aucun salon compteur trouvé (supprimés manuellement ?).")],
    });
    return;
  }

  if (action === "delete") {
    const cfg = getServerStats(guild.id);
    if (!cfg) {
      await interaction.reply({ components: [errPanel("Aucun compteur configuré.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    for (const id of [cfg.members_channel_id, cfg.online_channel_id, cfg.boosts_channel_id]) {
      if (!id) continue;
      const ch = await guild.channels.fetch(id).catch(() => null);
      if (ch) await ch.delete("Suppression des compteurs serverstats").catch(() => null);
    }
    clearServerStats(guild.id);
    await interaction.editReply({ components: [okPanel("🗑️ Compteurs supprimés.")] });
    return;
  }
}
