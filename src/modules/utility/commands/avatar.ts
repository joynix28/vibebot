import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, mediaBlock, actionRow, linkBtn } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Affiche l'avatar d'un membre en grand.")
  .addUserOption((o) => o.setName("membre").setDescription("Le membre dont voir l'avatar (toi par défaut)."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser("membre") ?? interaction.user;
  const url = user.displayAvatarURL({ size: 1024, extension: "png" });
  const animated = user.avatar?.startsWith("a_") ?? false;

  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`🖼️ **Avatar de ${user}**${animated ? " *(animé : clique sur « Ouvrir en grand » pour le GIF)*" : ""}`),
          mediaBlock([{ url, description: `Avatar de ${user.tag}` }]),
        ],
        0x5865f2
      ),
      actionRow(linkBtn(user.displayAvatarURL({ size: 4096 }), "Ouvrir en grand", "🔗")),
    ],
    flags: FLAGS_V2,
  });
}
