import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, panel, textBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("roleinfo")
  .setDescription("Affiche les informations d'un rôle.")
  .addRoleOption((o) => o.setName("role").setDescription("Le rôle à inspecter.").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const roleRef = interaction.options.getRole("role", true);
  const role = await guild.roles.fetch(roleRef.id).catch(() => null);
  if (!role) {
    await interaction.reply({ components: [errPanel("Rôle introuvable.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const perms = role.permissions.toArray();
  const created = Math.floor(role.createdTimestamp / 1000);
  const accent = role.color !== 0 ? role.color : 0x36373e;

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `## 🏷️ ${role.name}\n` +
              `> **ID :** \`${role.id}\` | **Mention :** ${role}\n` +
              `> **Couleur :** \`${role.hexColor}\` | **Position :** \`${role.position}\`\n` +
              `> **Membres :** \`${role.members.size}\`\n` +
              `> **Séparé :** ${role.hoist ? "oui" : "non"} | **Mentionnable :** ${role.mentionable ? "oui" : "non"} | **Géré par une intégration :** ${role.managed ? "oui" : "non"}\n` +
              `> **Créé le :** <t:${created}:D> (<t:${created}:R>)\n` +
              `> **Permissions clés :** \`${perms.slice(0, 8).join("`, `") || "aucune"}\`${perms.length > 8 ? ` *+${perms.length - 8}*` : ""}`
          ),
        ],
        accent
      ),
    ],
    flags: FLAGS_V2,
  });
}
