import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { panel, textBlock, msgPanel, FLAGS_V2 } from "../func/ui.ts";
import { ensureGuild, saveGuild, setBeastScore } from "../func/db.ts";

const SCORE_KEYS = [
  "ban",
  "kick",
  "channel_create",
  "channel_delete",
  "role_create",
  "role_delete",
  "role_update",
  "role_add",
  "bot_add",
  "prune",
];

const PUNISHMENTS: { value: number; name: string; key: string }[] = [
  { value: 0, name: "Clear Roles", key: "CLEAR_ROLES" },
  { value: 1, name: "Ban", key: "BAN" },
  { value: 2, name: "Kick", key: "KICK" },
];

export const data = (() => {
  const b = new SlashCommandBuilder()
    .setName("beast")
    .setDescription("Beast mode settings")
    .addSubcommand((s) => s.setName("enable").setDescription("Enable beast mode"))
    .addSubcommand((s) => s.setName("disable").setDescription("Disable beast mode"))
    .addSubcommand((s) =>
      s
        .setName("score_limit")
        .setDescription("Set beast mode score limit")
        .addIntegerOption((o) => o.setName("limit").setDescription("Score limit").setRequired(true).setMinValue(1).setMaxValue(1000))
    )
    .addSubcommand((s) =>
      s
        .setName("punishment")
        .setDescription("Set beast mode punishment")
        .addIntegerOption((o) => o.setName("type").setDescription("Punishment type").setRequired(true).addChoices(...PUNISHMENTS))
    );
  b.addSubcommandGroup((g) => {
    g.setName("score").setDescription("Set a score");
    for (const k of SCORE_KEYS) {
      g.addSubcommand((s) =>
        s.setName(k).setDescription(`${k} score`).addIntegerOption((o) => o.setName("n").setDescription("Score").setRequired(true).setMinValue(0).setMaxValue(1000))
      );
    }
    return g;
  });
  return b;
})();

const BLUE = 0x297fb9;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const isOwner = guild.ownerId === interaction.user.id;
  const perms = (interaction.member as any)?.permissions;
  await interaction.deferReply({ flags: FLAGS_V2 });
  if (!isOwner && !perms?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({ components: [msgPanel(":red_circle: | You don't have permission to use this command.", BLUE)], flags: FLAGS_V2 });
    return;
  }

  const cfg = ensureGuild(guild.id);
  const sub = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup();
  let msg = "";

  if (sub === "enable") {
    cfg.beast_enabled = 1;
    saveGuild(cfg);
    msg = ":green_circle: | Beast mode has been enabled.";
  } else if (sub === "disable") {
    cfg.beast_enabled = 0;
    saveGuild(cfg);
    msg = ":red_circle: | Beast mode has been disabled.";
  } else if (sub === "score_limit") {
    const limit = interaction.options.getInteger("limit")!;
    cfg.beast_score_limit = limit;
    saveGuild(cfg);
    setBeastScore(guild.id, "score_limit", limit);
    msg = `Beast mode score limit has been set to **${limit}**.`;
  } else if (sub === "punishment") {
    const p = PUNISHMENTS.find((x) => x.value === interaction.options.getInteger("type"))!;
    cfg.beast_punishment = p.key;
    saveGuild(cfg);
    msg = `Beast mode punishment has been set to **${p.name}**.`;
  } else if (group === "score") {
    const n = interaction.options.getInteger("n")!;
    setBeastScore(guild.id, sub, n);
    msg = `The **${sub.replace(/_/g, " ")}** score has been set to **${n}**.`;
  } else {
    msg = ":red_circle: | Unknown beast command.";
  }

  await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
}
