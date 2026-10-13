import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { FLAGS_V2_EPHEMERAL, errPanel, okPanel } from "../func/ui.ts";
import { addXp } from "../func/db.ts";
import { levelFromXp } from "../func/xp.ts";

export const data = new SlashCommandBuilder()
  .setName("addxp")
  .setDescription("Ajoute ou retire de l'XP à un membre (modération).")
  .addUserOption((o) => o.setName("membre").setDescription("Le membre ciblé.").setRequired(true))
  .addIntegerOption((o) =>
    o
      .setName("quantite")
      .setDescription("Quantité d'XP (négatif pour en retirer).")
      .setRequired(true)
      .setMinValue(-100000)
      .setMaxValue(100000)
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
  const target = interaction.options.getUser("membre", true);
  const amount = interaction.options.getInteger("quantite", true);
  if (target.bot) {
    await interaction.reply({ components: [errPanel("Impossible de donner de l'XP à un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const row = addXp(guild.id, target.id, amount);
  const verb = amount >= 0 ? "ajouté" : "retiré";
  await interaction.reply({
    components: [
      okPanel(
        `✅ ${verb === "ajouté" ? "Ajout" : "Retrait"} d'XP effectué.\n` +
          `> **Membre :** <@${target.id}>\n` +
          `> **Quantité :** \`${amount >= 0 ? "+" : ""}${amount}\` XP\n` +
          `> **Total :** \`${row.xp}\` XP — Niveau \`${levelFromXp(row.xp)}\``
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
