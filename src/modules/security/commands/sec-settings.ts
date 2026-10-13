import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, sepBlock, textBlock, fieldRaw, msgPanel, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, parseNukeActions, parseBeastScores } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("sec-settings")
  .setDescription("Get current settings of the server")
  .addIntegerOption((o) =>
    o
      .setName("category")
      .setDescription("Choose the settings category you want to see")
      .setRequired(true)
      .addChoices(
        { name: "Anti Nuke", value: 0 },
        { name: "Verification", value: 1 },
        { name: "Beast Mode", value: 2 }
      )
  );

const BLUE = 0x297fb9;
const ON = ":green_circle:";
const OFF = ":red_circle:";

const ACTIONS: { key: string; name: string; hasLimit?: boolean; punish?: string }[] = [
  { key: "ban", name: "Anti Ban", hasLimit: true },
  { key: "kick", name: "Anti Kick", hasLimit: true },
  { key: "role_create", name: "Anti Role Create", hasLimit: true },
  { key: "role_delete", name: "Anti Role Delete", hasLimit: true },
  { key: "channel_create", name: "Anti Channel Create", hasLimit: true },
  { key: "channel_delete", name: "Anti Channel Delete", hasLimit: true },
  { key: "bot", name: "Anti Bot" },
  { key: "prune", name: "Anti Prune", punish: "Ban" },
  { key: "role_update", name: "Anti Role Update" },
  { key: "role_add", name: "Anti RoleAdd" },
  { key: "invite", name: "Anti InviteLink", punish: "Message will be deleted" },
];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });

  const cfg = ensureGuild(guild.id);
  const cat = interaction.options.getInteger("category") ?? 0;
  let blocks: any[] = [];

  if (cat === 0) {
    const acts = parseNukeActions(cfg);
    blocks = [textBlock("# Anti Nuke Settings"), sepBlock()];
    for (const a of ACTIONS) {
      const d = acts[a.key] ?? { enabled: false };
      const emoji = d.enabled ? ON : OFF;
      const punish = a.punish ?? cfg.nuke_punishment.toLowerCase().replace(/_/g, " ");
      const label = `**${a.name} ${emoji}**`;
      let val = `Punishment: ${cap(punish)}`;
      if (a.hasLimit) val = `Limit: ${d.limit ?? 0}\nPunishment: ${cap(punish)}`;
      blocks.push(textBlock(`> ${label}\n> ${val}`));
    }
  } else if (cat === 1) {
    const emoji = cfg.verify_enabled ? ON : OFF;
    const role = cfg.verify_role ? `<@&${cfg.verify_role}>` : `Not-Set \`/verification setup_role\``;
    const chan = cfg.verify_channel ? `<#${cfg.verify_channel}>` : `Not-Set \`/verification setup_channel\``;
    blocks = [
      textBlock("# Verification Settings"),
      sepBlock(),
      textBlock(`> Working: ${emoji} \`/verification enable\``),
      textBlock(`> Unverified Role: ${role}`),
      textBlock(`> Verification Channel: ${chan}`),
    ];
  } else {
    const scores = parseBeastScores(cfg);
    const emoji = cfg.beast_enabled ? ON : OFF;
    blocks = [
      textBlock("# Beast Mode Settings"),
      textBlock("You can update beast mode settings using `/sec-settings`."),
      sepBlock(),
      textBlock(`> **Enabled:** ${emoji}`),
      textBlock(`> **Punishment:** ${cfg.beast_punishment.toLowerCase().replace(/_/g, " ")}`),
      textBlock(`> **Score Limit:** ${scores.score_limit ?? cfg.beast_score_limit}`),
      textBlock(`> **Ban Score:** ${scores.ban ?? 0}`),
      textBlock(`> **Kick Score:** ${scores.kick ?? 0}`),
      textBlock(`> **Channel Create Score:** ${scores.channel_create ?? 0}`),
      textBlock(`> **Channel Delete Score:** ${scores.channel_delete ?? 0}`),
      textBlock(`> **Role Create Score:** ${scores.role_create ?? 0}`),
      textBlock(`> **Role Delete Score:** ${scores.role_delete ?? 0}`),
      textBlock(`> **Role Update Score:** ${scores.role_update ?? 0}`),
      textBlock(`> **Role Add Score:** ${scores.role_add ?? 0}`),
      textBlock(`> **Bot Add Score:** ${scores.bot_add ?? 0}`),
      textBlock(`> **Prune Score:** ${scores.prune ?? 0}`),
    ];
  }

  await interaction.editReply({ components: [panel(blocks, BLUE)], flags: FLAGS_V2_EPHEMERAL });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
