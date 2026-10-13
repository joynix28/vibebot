import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, tb, row, lnk, frog, flags_ephemeral } from "../../func/ui.ts";
import { meta } from "../../func/emoji.ts";

export const data = new SlashCommandBuilder()
  .setName("vote")
  .setDescription("Vote for Frog on top.gg");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const body = panel(
    [
      tb(
        `## ${meta("frogwow").tag} Vote for Frog\n` +
          "Voting helps Frog reach more servers and catch more spammers. Takes two seconds!"
      ),
      row(lnk("https://top.gg/bot/1438562278172790925/vote", "Vote on top.gg", meta("frogwow").raw)),
    ],
    frog
  );
  await interaction.reply({ components: [body], flags: flags_ephemeral });
}
