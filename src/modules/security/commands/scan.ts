import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, sepBlock, textBlock, fieldRaw, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { ensureGuild } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("Let Security to take a deep look into your server and tells you what to do");

const BLUE = 0x297fb9;

const SCAN_DESC =
  "Security is now taking a deep look into your server, please allow a few minutes for it to finish.";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function diff(lines: string[]): string {
  return "```diff\n" + lines.join("\n") + "\n```";
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  await interaction.deferReply({ flags: FLAGS_V2 });

  const scan = panel([textBlock(SCAN_DESC)], BLUE);
  await interaction.editReply({ components: [scan], flags: FLAGS_V2 });

  await wait(4000);

  const cfg = ensureGuild(guild.id);

  const danger: string[] = [];
  const warn: string[] = [];
  if (!cfg.raid_enabled) danger.push("- Anti Raid is not enabled, it's required to stop raids.");
  if (!cfg.beast_enabled) warn.push("! Beast Mode is not enabled, it's recommended as it works using a score based system on the whole server.");
  if (!cfg.verify_enabled) warn.push("! Your server doesn't have verification enabled, it's recommended as to stop bot accounts.");
  if (!cfg.mod_log) warn.push("! Mod logs is not setup.");
  if (!cfg.security_log) warn.push("! Security logs is not setup.");

  const everyone = guild.id;
  const adminRoles = guild.roles.cache.filter((r) => r.id !== everyone && !r.managed && r.permissions.has("Administrator"));
  const botRoles = guild.roles.cache.filter((r) => r.managed && r.permissions.has("Administrator"));

  const blocks: any[] = [
    textBlock(
      "Below are the things that should be fixed."
    ),
    sepBlock(),
  ];
  if (danger.length) blocks.push(textBlock("**Dangerous and should be fixed**\n" + diff(danger)));
  if (warn.length) blocks.push(textBlock("**Warning and recommended to be fixed**\n" + diff(warn)));
  if (adminRoles.size) {
    const names = adminRoles.map((r) => `- @${r.name}`).join("\n");
    blocks.push(textBlock("**Roles with administrator permission which are not recommended to be kept**\n" + diff([names])));
  }
  if (botRoles.size) {
    const names = botRoles.map((r) => `- @${r.name}`).join("\n");
    blocks.push(textBlock("**Bot roles with dangerous permissions**\n" + diff([names])));
  }
  if (danger.length === 0 && warn.length === 0 && adminRoles.size === 0 && botRoles.size === 0) {
    blocks.push(textBlock(fieldRaw("Great", "Your server looks good, nothing needs to be fixed.")));
  }

  const results = panel(blocks, BLUE);
  await interaction.editReply({ components: [results], flags: FLAGS_V2 });
}
