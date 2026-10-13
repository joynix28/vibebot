import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { g, sv, lsChg, type Guild } from "../../func/db.ts";
import { st, panel, tx, V2E, type Blk } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-changes")
  .setDescription("View and revert changes made to your Discord server")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) => s.setName("enable").setDescription("Enable change tracking for this server"))
  .addSubcommand((s) => s.setName("disable").setDescription("Disable change logging for this server"))
  .addSubcommand((s) => s.setName("list").setDescription("List changes that have recently been made to your server"));

const bl = 0x4a9fe0;
const gr = 0x5bd57b;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);

  if (sub === "enable") {
    cfg.xp_keep_roles = 1;
    sv(cfg);
    await interaction.reply({ components: [st("Success", gr, "Successfully **enabled change tracking** for this server.")], flags: V2E });
    return;
  }

  if (sub === "disable") {
    cfg.xp_keep_roles = 0;
    sv(cfg);
    await interaction.reply({ components: [st("Success", gr, "Successfully **disabled change logging** for this server.")], flags: V2E });
    return;
  }

  const changes = lsChg(guild.id);
  if (changes.length === 0) {
    await interaction.reply({ components: [st("Info", bl, "There are **no recent changes** to display.")], flags: V2E });
    return;
  }
  const blocks: Blk[] = [
    tx("**Recent Changes**"),
    tx(`Displaying **${changes.length}** change(s)`),
    tx("\u200b"),
    ...changes.map((c) => tx(`<t:${Math.floor(c.created_at / 1000)}:R> - ${c.description}`)),
  ];
  await interaction.reply({ components: [panel(blocks)], flags: V2E });
}
