import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, field, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("role-info")
  .setDescription("Afficher les informations sur un rôle du serveur.")
  .addRoleOption((o) => o.setName("role").setDescription("Rôle à inspecter.").setRequired(true));

const PERM_LABELS: Record<string, string> = {
  CreateInstantInvite: "Créer une invitation",
  KickMembers: "Expulser des membres",
  BanMembers: "Bannir des membres",
  Administrator: "Administrateur",
  ManageChannels: "Gérer les salons",
  ManageGuild: "Gérer le serveur",
  AddReactions: "Ajouter des réactions",
  ViewAuditLog: "Voir les logs du serveur",
  PrioritySpeaker: "Voix prioritaire",
  Stream: "Vidéo",
  ViewChannel: "Voir les salons",
  SendMessages: "Envoyer des messages",
  SendTTSMessages: "Envoyer des messages TTS",
  ManageMessages: "Gérer les messages",
  EmbedLinks: "Intégrer des liens",
  AttachFiles: "Joindre des fichiers",
  ReadMessageHistory: "Voir l'historique",
  MentionEveryone: "Mentionner @everyone",
  UseExternalEmojis: "Utiliser des emojis externes",
  ViewGuildInsights: "Voir les statistiques",
  Connect: "Se connecter",
  Speak: "Parler",
  MuteMembers: "Rendre muet",
  DeafenMembers: "Rendre sourd",
  MoveMembers: "Déplacer des membres",
  UseVAD: "Détection de la voix",
  ChangeNickname: "Changer de pseudo",
  ManageNicknames: "Gérer les pseudos",
  ManageRoles: "Gérer les rôles",
  ManageWebhooks: "Gérer les webhooks",
  ManageGuildExpressions: "Gérer les emojis et stickers",
  UseApplicationCommands: "Utiliser les commandes",
  RequestToSpeak: "Demander à parler",
  ManageEvents: "Gérer les événements",
  ManageThreads: "Gérer les fils",
  ModerateMembers: "Exclure temporairement",
  SendPolls: "Créer des sondages",
};

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}> (<t:${s}:R>)`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const roleOpt = interaction.options.getRole("role", true);
  const role = guild.roles.cache.get(roleOpt.id);
  if (!role) {
    await replyErr(interaction, "❌ Rôle introuvable.");
    return;
  }

  const isAdmin = role.permissions.has("Administrator");
  const permList = isAdmin
    ? "Administrateur"
    : role.permissions
        .toArray()
        .map((p: string) => PERM_LABELS[p] ?? p)
        .join(", ") || "Aucune permission";
  const colorText =
    role.hexColor === "#000000"
      ? "Transparent"
      : role.colors.secondaryColor !== role.colors.primaryColor
        ? `Dégradé (${role.colors.primaryColor} → ${role.colors.secondaryColor})`
        : `Solide (${role.hexColor})`;

  const lines = [
    `> **Administrateur :** ${isAdmin ? "🛠️ Oui" : "Non"}`,
    `> **Membres ayant ce rôle :** ${role.members.size}`,
    `> **Rôle d'intégration :** ${role.managed ? "Oui" : "Non"}`,
    `> **Rôle booster :** ${role.tags?.premiumSubscriberRole ? "Oui" : "Non"}`,
    `> **Permissions :** ${permList.slice(0, 900)}`,
  ];

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`# 🧭 ${role.name}`),
          sepBlock(),
          textBlock(
            [
              field("ID", role.id),
              field("Créé le", ts(role.createdTimestamp)),
              `> **Couleur :** ${colorText}`,
              `> **Position :** ${role.position}/${guild.roles.cache.size - 1}`,
              `> **Affiché séparément :** ${role.hoist ? "Oui" : "Non"}`,
              `> **Mentionnable :** ${role.mentionable ? "Oui" : "Non"}`,
            ].join("\n")
          ),
          sepBlock(),
          textBlock(lines.join("\n")),
        ],
        BLURPLE
      ),
    ],
    flags: FLAGS_V2,
  });
}
