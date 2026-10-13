import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { FLAGS_V2_EPHEMERAL, errPanel, okPanel } from "../func/ui.ts";
import { getInviteConfig, saveInviteConfig } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("invites-config")
  .setDescription("Configure le suivi des invitations et les messages d'arrivée/départ.")
  .addBooleanOption((o) => o.setName("activer").setDescription("Active ou désactive le suivi des invitations."))
  .addStringOption((o) =>
    o
      .setName("message-bienvenue")
      .setDescription("Message d'arrivée. Variables : {user} {server} {count} {inviter}.")
      .setMaxLength(500)
  )
  .addStringOption((o) =>
    o
      .setName("message-aurevoir")
      .setDescription("Message de départ. Variables : {user} {server} {count} {inviter}.")
      .setMaxLength(500)
  )
  .addChannelOption((o) =>
    o
      .setName("salon-bienvenue")
      .setDescription("Salon des messages d'arrivée.")
      .addChannelTypes(ChannelType.GuildText)
  )
  .addChannelOption((o) =>
    o
      .setName("salon-aurevoir")
      .setDescription("Salon des messages de départ.")
      .addChannelTypes(ChannelType.GuildText)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Commande utilisable uniquement sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ components: [errPanel("Permission requise : Gérer le serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const cfg = getInviteConfig(guild.id);
  const activer = interaction.options.getBoolean("activer");
  const joinMsg = interaction.options.getString("message-bienvenue");
  const leaveMsg = interaction.options.getString("message-aurevoir");
  const joinCh = interaction.options.getChannel("salon-bienvenue");
  const leaveCh = interaction.options.getChannel("salon-aurevoir");

  if (activer !== null) cfg.enabled = activer ? 1 : 0;
  if (joinMsg !== null) cfg.join_message = joinMsg;
  if (leaveMsg !== null) cfg.leave_message = leaveMsg;
  if (joinCh) cfg.join_channel = joinCh.id;
  if (leaveCh) cfg.leave_channel = leaveCh.id;
  saveInviteConfig(cfg);

  await interaction.reply({
    components: [
      okPanel(
        `# 📨 Configuration des invitations\n` +
          `> **Suivi :** ${cfg.enabled ? "✅ activé" : "❌ désactivé"}\n` +
          `> **Salon d'arrivée :** ${cfg.join_channel ? `<#${cfg.join_channel}>` : "*non défini*"}\n` +
          `> **Salon de départ :** ${cfg.leave_channel ? `<#${cfg.leave_channel}>` : "*non défini*"}\n` +
          `> **Message d'arrivée :** ${cfg.join_message ? `\`${cfg.join_message}\`` : "*défaut*"}\n` +
          `> **Message de départ :** ${cfg.leave_message ? `\`${cfg.leave_message}\`` : "*défaut*"}\n\n` +
          `*Variables disponibles : {user} {server} {count} {inviter}*`
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
