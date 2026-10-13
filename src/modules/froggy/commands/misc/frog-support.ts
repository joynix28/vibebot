import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, tb, row, lnk, frog, flags_ephemeral } from "../../func/ui.ts";
import { meta } from "../../func/emoji.ts";

const disc = "https://discord.gg/jz4DXKvu2E";

export const data = new SlashCommandBuilder()
  .setName("frog-support")
  .setDescription("Get the link to the Frog support server");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const body = panel(
    [
      tb(
        `## ${meta("froghuh").tag} Support Server\n` +
          "Need help setting up Frog, found a bug, or have a suggestion? Join the support server."
      ),
      row(lnk(disc, "Join Support Server", meta("froghuh").raw)),
    ],
    frog
  );
  await interaction.reply({ components: [body], flags: flags_ephemeral });
}
