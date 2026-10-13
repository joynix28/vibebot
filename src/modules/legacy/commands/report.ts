import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  RED,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { createReport, listOpenReports } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("report")
  .setDescription("Signale un membre au staff.")
  .addSubcommand((s) =>
    s
      .setName("send")
      .setDescription("Signale un membre.")
      .addUserOption((o) => o.setName("membre").setDescription("Le membre à signaler.").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("La raison du signalement.").setRequired(true).setMaxLength(1000))
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon de modération (défaut : le salon actuel).").addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) => s.setName("list").setDescription("Liste les signalements ouverts (staff)."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.reply({ components: [errPanel("Réservé au staff.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const reports = listOpenReports(guild.id);
    if (reports.length === 0) {
      await interaction.reply({ components: [okPanel("Aucun signalement ouvert. 🎉")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const lines = reports
      .map((r) => `\`#${r.id}\` — <@${r.target_id}> signalé par <@${r.reporter_id}>\n> ${r.reason.slice(0, 200)}`)
      .join("\n");
    await interaction.reply({ components: [panel([textBlock(`## 🚨 Signalements ouverts\n${lines}`)], RED)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // send
  const target = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas te signaler toi-même.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.bot) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas signaler un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const optChannel = interaction.options.getChannel("salon");
  const targetId = optChannel?.id ?? interaction.channelId;
  const targetChannel = (await guild.channels.fetch(targetId).catch(() => null)) as TextBasedChannel | null;
  if (!targetChannel?.isSendable()) {
    await interaction.reply({ components: [errPanel("Salon introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = createReport(guild.id, interaction.user.id, target.id, reason);
  const sent = await targetChannel
    .send({
      components: [
        panel(
          [
            textBlock(`## 🚨 Signalement #${id}`),
            sepBlock(false),
            textBlock(`${fieldRaw("Membre signalé", `${target} (\`${target.tag} | ${target.id}\`)`)}\n${fieldRaw("Signalé par", `<@${interaction.user.id}>`)}\n${fieldRaw("Raison", reason)}`),
          ],
          RED
        ),
      ],
      flags: FLAGS_V2,
    })
    .catch(() => null);
  if (!sent) {
    await interaction.reply({ components: [errPanel("Impossible d'envoyer le signalement dans ce salon.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [okPanel(`🚨 Signalement #${id} envoyé. Merci, le staff va s'en occuper.`)], flags: FLAGS_V2_EPHEMERAL });
}
