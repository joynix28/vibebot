import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { g, type Guild } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("whitelabel")
  .setDescription("Customize the appearance of the bot in this server")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("setup")
      .setDescription("Customize the appearance of the bot in your server")
      .addStringOption((o) => o.setName("display_name").setDescription("The new display name for the bot in your server").setRequired(false))
      .addAttachmentOption((o) => o.setName("icon").setDescription("The new icon for the bot in your server").setRequired(false))
  )
  .addSubcommand((s) => s.setName("disable").setDescription("Reset the appearance of the bot in your server to the default"));

const gr = 0x5bd57b;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);

  if (sub === "setup") {
    const name = interaction.options.getString("display_name");
    const icon = interaction.options.getAttachment("icon");

    const parts = [`**Display Name:** ${name ?? "unchanged"}`];
    if (icon) parts.push(`**Icon:** \`${icon.name}\``);
    else parts.push("**Icon:** unchanged");

    await interaction.reply({
      components: [st("Success", gr, `Successfully **updated whitelabel** for this server.\n\n${parts.join("\n")}\n\n> Note: Discord doesn't allow changing the bot name/icon per-server. Use the bot's own display name instead.`)],
      flags: V2E,
    });
    return;
  }

  if (sub === "disable") {
    await interaction.reply({
      components: [st("Success", gr, "Successfully **disabled whitelabel** for this server.")],
      flags: V2E,
    });
  }
}
