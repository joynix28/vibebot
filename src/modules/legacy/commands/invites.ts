import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { BLUE, FLAGS_V2, panel, textBlock } from "../func/ui.ts";
import { getInviteStats } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("invites")
  .setDescription("Affiche les invitations d'un membre.")
  .addUserOption((o) => o.setName("membre").setDescription("Le membre à consulter (défaut : toi)."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Commande utilisable uniquement sur un serveur.", ephemeral: true });
    return;
  }
  const target = interaction.options.getUser("membre") ?? interaction.user;
  const stats = getInviteStats(guild.id, target.id);

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `# 📨 Invitations de ${target.username}\n` +
              `> **Invités :** \`${stats.joined}\`\n` +
              `> **Partis :** \`${stats.left}\`\n` +
              `> **Restants :** \`${stats.total}\``
          ),
        ],
        BLUE
      ),
    ],
    flags: FLAGS_V2,
  });
}
