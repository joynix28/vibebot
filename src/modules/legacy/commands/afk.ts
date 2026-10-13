import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL, okPanel, errPanel } from "../../../core/ui.ts";
import { setAfk, removeAfk, getAfk } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("afk")
  .setDescription("Signale que tu es absent (AFK).")
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Passe en AFK.")
      .addStringOption((o) => o.setName("raison").setDescription("La raison de ton absence.").setMaxLength(200))
  )
  .addSubcommand((s) => s.setName("remove").setDescription("Retire ton statut AFK."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const reason = interaction.options.getString("raison")?.trim() || "AFK";
    setAfk(guild.id, interaction.user.id, reason);
    await interaction.reply({ components: [okPanel(`💤 Tu es maintenant AFK : *${reason}*`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // remove
  const removed = removeAfk(guild.id, interaction.user.id);
  await interaction.reply({
    components: [removed ? okPanel("👋 Tu n'es plus AFK. Bon retour !") : errPanel("Tu n'es pas AFK.")],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Utilisé par l'event messageCreate (exporté pour les tests / futurs usages). */
export function currentAfk(guildId: string, userId: string) {
  return getAfk(guildId, userId);
}
