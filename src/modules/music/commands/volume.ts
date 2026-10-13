import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { getQueue, canControl } from "../func/player.ts";
import { getSettings } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("volume")
  .setDescription("Affiche ou règle le volume (DJ uniquement pour régler).")
  .addIntegerOption((o) =>
    o.setName("niveau").setDescription("Volume de 0 à 100.").setMinValue(0).setMaxValue(100)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const level = interaction.options.getInteger("niveau");
  const queue = getQueue(guild.id);

  if (level === null) {
    const v = queue ? queue.volume : getSettings(guild.id).default_volume;
    await interaction.reply({ components: [msgPanel(`🔊 Volume actuel : **${v}%**`, BLUE)], flags: FLAGS_V2 });
    return;
  }

  if (!canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut régler le volume.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (queue) queue.setVolume(level);
  await interaction.reply({ components: [okPanel(`🔊 Volume réglé à **${level}%**.`)], flags: FLAGS_V2 });
}
