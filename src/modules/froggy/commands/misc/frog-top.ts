import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from "discord.js";
import {
  panel,
  tb,
  sep,
  row,
  sel,
  frog,
  flags_v2,
} from "../../func/ui.ts";
import { gTop, tot, grand, today, servers, rank, topUsers } from "../../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("frog-top")
  .setDescription("View Frog catch leaderboards — your server, top servers, and top catches");

const medals = ["🥇", "🥈", "🥉"];
const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, w: string) => `${fmt(n)} ${w}${n === 1 ? "" : "s"}`;

async function displayName(id: string, interaction: ChatInputCommandInteraction | StringSelectMenuInteraction): Promise<string> {
  try {
    const u = interaction.client.users.cache.get(id) ?? (await interaction.client.users.fetch(id));
    return u.username;
  } catch {
    return id;
  }
}

async function serverName(id: string, interaction: ChatInputCommandInteraction | StringSelectMenuInteraction): Promise<string> {
  return interaction.client.guilds.cache.get(id)?.name ?? id;
}

async function build(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction, category: string): Promise<string> {
  const guild = interaction.guild;
  if (category === "top_servers") {
    const list = servers().slice(0, 10);
    const lines: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const name = await serverName(list[i]!.guild_id, interaction);
      const medal = medals[i] ?? `\`${i + 1}.\``;
      lines.push(`${medal} **${name}** — ${plural(list[i]!.n, "catch")}`);
    }
    return `## 🏆 Top Servers\n-# Ranked by total catches\n\n${lines.join("\n")}`;
  }

  if (category === "top_users") {
    const list = topUsers(10);
    const lines: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const name = await displayName(list[i]!.user_id, interaction);
      const medal = medals[i] ?? `\`${i + 1}.\``;
      lines.push(`${medal} **${name}** — ${plural(list[i]!.n, "catch")}`);
    }
    return `## 🪰 Top Catches (Global)\n-# Most frequently caught users across every server\n\n${lines.join("\n")}`;
  }

  if (category === "global_overview") {
    const protectedServers = (await interaction.client.guilds.fetch()).size;
    return (
      `## 🌍 Global Overview\n-# Bot-wide stats across every server Frog protects\n\n` +
      `**Protected Servers** › ${fmt(protectedServers)}\n` +
      `**Total Catches** › ${fmt(grand())}\n` +
      `**Caught Today** › ${fmt(today())}`
    );
  }

  const guildName = guild?.name ?? "this server";
  const top = guild ? gTop(guild.id, 10) : [];
  const total = guild ? tot(guild.id) : 0;
  const lines: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const name = await displayName(top[i]!.user_id, interaction);
    const medal = medals[i] ?? `\`${i + 1}.\``;
    lines.push(`${medal} **${name}** — ${plural(top[i]!.n, "catch")}`);
  }
  const pos = guild ? rank(guild.id) : 0;
  const serverCount = servers().length;
  return (
    `## 🏠 This Server\n-# Top catches in **${guildName}**\n\n` +
    (lines.join("\n") || "*No catches yet*") +
    `\n\n-# Total catches: ${fmt(total)} · Global rank: ${pos ? `#${fmt(pos)} of ${fmt(serverCount)}` : "n/a"}`
  );
}

const options = [
  { label: "This Server", value: "this_server", description: "Top catches in this server", emoji: "🏠" },
  { label: "Top Servers", value: "top_servers", description: "Servers with the most catches", emoji: "🏆" },
  { label: "Top Catches", value: "top_users", description: "Most-caught users across all servers", emoji: "🪰" },
  { label: "Global Overview", value: "global_overview", description: "Bot-wide stats across every server", emoji: "🌍" },
];

async function send(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction, category: string): Promise<void> {
  const content = await build(interaction, category);
  const body = panel(
    [
      tb(content),
      sep(),
      row(sel({ customId: `frog-top:select:${interaction.user.id}`, options: options.map((o) => ({ ...o, default: o.value === category })) })),
    ],
    frog
  );
  if (interaction.isChatInputCommand()) {
    await interaction.reply({ components: [body], flags: flags_v2 });
  } else {
    await interaction.update({ components: [body] });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await send(interaction, "this_server");
}

export async function handleComponent(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const [, , uid] = interaction.customId.split(":");
  if (uid && uid !== interaction.user.id) return;
  const category = interaction.values[0] ?? "this_server";
  await send(interaction, category);
}
