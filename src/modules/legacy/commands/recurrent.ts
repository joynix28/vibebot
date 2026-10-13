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
  addRecurrent,
  getRecurrent,
  listRecurrents,
  deleteRecurrent,
} from "../func/db-plus.ts";
import { scheduleRecurrent, unscheduleRecurrent } from "../func/recurrent.ts";

export const data = new SlashCommandBuilder()
  .setName("recurrent")
  .setDescription("Gère les messages envoyés automatiquement à intervalle régulier.")
  .addSubcommand((s) =>
    s
      .setName("ajouter")
      .setDescription("Ajoute un message récurrent.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon d'envoi.").setRequired(true).addChannelTypes(ChannelType.GuildText)
      )
      .addIntegerOption((o) =>
        o.setName("intervalle").setDescription("Intervalle en minutes (5 à 10080).").setRequired(true).setMinValue(5).setMaxValue(10080)
      )
      .addStringOption((o) =>
        o.setName("message").setDescription("Le message à envoyer.").setRequired(true).setMaxLength(1500)
      )
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Liste les messages récurrents."))
  .addSubcommand((s) =>
    s
      .setName("supprimer")
      .setDescription("Supprime un message récurrent.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du message récurrent.").setRequired(true).setMinValue(1))
  );

function adminOnly(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!adminOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "liste") {
    const rows = listRecurrents(guild.id);
    if (rows.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun message récurrent. Ajoute-en un avec `/recurrent ajouter`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const lines = rows.map((r) => {
      const preview = r.message.length > 60 ? r.message.slice(0, 57) + "…" : r.message;
      return `\`#${r.id}\` <#${r.channel_id}> — toutes les **${r.interval_min} min**\n> ${preview}`;
    });
    await interaction.reply({
      components: [panel([textBlock("## 🔁 Messages récurrents"), sepBlock(false), textBlock(lines.join("\n\n"))], BLUE)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "supprimer") {
    const id = interaction.options.getInteger("id", true);
    const row = getRecurrent(id);
    if (!row || row.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel(`Message récurrent #${id} introuvable.`)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    unscheduleRecurrent(id);
    deleteRecurrent(id);
    await interaction.reply({ components: [okPanel(`🗑️ Message récurrent #${id} supprimé.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // ajouter
  const salon = interaction.options.getChannel("salon", true);
  const intervalle = interaction.options.getInteger("intervalle", true);
  const message = interaction.options.getString("message", true).trim();
  const row = addRecurrent({
    guildId: guild.id,
    channelId: salon.id,
    intervalMin: intervalle,
    message,
    createdBy: interaction.user.id,
  });
  scheduleRecurrent(interaction.client, row);
  await interaction.reply({
    components: [okPanel(`🔁 Message récurrent #${row.id} créé : envoi dans <#${salon.id}> toutes les **${intervalle} min**.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
