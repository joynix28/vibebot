import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, panel, textBlock, mediaBlock, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("Affiche les informations du serveur.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const owner = await guild.fetchOwner().catch(() => null);
  const created = Math.floor(guild.createdTimestamp / 1000);
  const text = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).size;
  const voice = guild.channels.cache.filter((c) => c.isVoiceBased()).size;
  const emojis = guild.emojis.cache.size;
  const icon = guild.iconURL({ size: 512 });

  const blocks = [
    textBlock(
      `## 🏰 ${guild.name}\n` +
        `> **ID :** \`${guild.id}\`\n` +
        `> **Propriétaire :** ${owner ? `${owner} (\`${owner.id}\`)` : "*inconnu*"}\n` +
        `> **Créé le :** <t:${created}:F> (<t:${created}:R>)\n` +
        `> **Membres :** \`${guild.memberCount}\` | **Rôles :** \`${guild.roles.cache.size}\`\n` +
        `> **Salons :** \`${text}\` texte • \`${voice}\` vocaux\n` +
        `> **Emojis :** \`${emojis}\` | **Boosts :** \`${guild.premiumSubscriptionCount ?? 0}\` (niveau ${guild.premiumTier})\n` +
        `> **Vérification :** \`${guild.verificationLevel}\` | **Filtre explicite :** \`${guild.explicitContentFilter}\``
    ),
  ];
  if (icon) blocks.push(mediaBlock([{ url: icon, description: `Icône de ${guild.name}` }]));

  await interaction.reply({ components: [panel(blocks, 0x5865f2)], flags: FLAGS_V2 });
}
