import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { g, setPermLvl, type Guild } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-settings")
  .setDescription("Manage server settings")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("permissions")
      .setDescription("Set who is able to create/load backups, syncs and chatlogs")
      .addStringOption((o) =>
        o
          .setName("level")
          .setDescription("The permissions level for this server")
          .setRequired(true)
          .addChoices(
            { name: "Admins can use all commands", value: "all" },
            { name: "Admins can not take destructive actions", value: "safe" },
            { name: "Only the owner can use the relevant commands", value: "owner" }
          )
      )
  )
  .addSubcommand((s) => s.setName("show").setDescription("Show the current settings for this server"));

const bl = 0x4a9fe0;
const gr = 0x5bd57b;

const LVL: Record<string, string> = {
  all: "Admins can use all commands",
  safe: "Admins can not take destructive actions",
  owner: "Only the owner can use the relevant commands",
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);

  if (sub === "permissions") {
    const lvl = interaction.options.getString("level")!;
    setPermLvl(guild.id, lvl);
    await interaction.reply({
      components: [st("Success", gr, `Successfully **updated the permissions** for this server.\n\n**New level:** ${LVL[lvl] ?? lvl}`)],
      flags: V2E,
    });
    return;
  }

  await interaction.reply({
    components: [st("Server Settings", bl, "Manage who is able to create backups, syncs & chatlogs and load backups, chatlogs & templates. This does not affect basic commands like `/ping`.")],
    flags: V2E,
  });
}
