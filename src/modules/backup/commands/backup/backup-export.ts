import { SlashCommandBuilder, Collection } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-export")
  .setDescription("Export data from this server as JSON or CSV files")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) => s.setName("guild").setDescription("Export the server settings, channels, roles, emojis, and stickers as a JSON file"))
  .addSubcommand((s) =>
    s
      .setName("channels")
      .setDescription("Export a list of channels from this server")
      .addStringOption((o) => o.setName("format").setDescription("The file format. Either json or csv").addChoices({ name: "json", value: "json" }, { name: "csv", value: "csv" }))
  )
  .addSubcommand((s) =>
    s
      .setName("channel")
      .setDescription("Export a specific channel from this server")
      .addChannelOption((o) => o.setName("channel").setDescription("The channel that you want to export"))
  )
  .addSubcommand((s) =>
    s
      .setName("roles")
      .setDescription("Export a list of roles from this server")
      .addStringOption((o) => o.setName("format").setDescription("The file format. Either json or csv").addChoices({ name: "json", value: "json" }, { name: "csv", value: "csv" }))
  )
  .addSubcommand((s) =>
    s
      .setName("role")
      .setDescription("Export a specific role from this server")
      .addRoleOption((o) => o.setName("role").setDescription("The role that you want to export"))
  )
  .addSubcommand((s) =>
    s
      .setName("bans")
      .setDescription("Export a list of bans from this server")
      .addStringOption((o) => o.setName("format").setDescription("The file format. Either json or csv").addChoices({ name: "json", value: "json" }, { name: "csv", value: "csv" }))
  )
  .addSubcommand((s) =>
    s
      .setName("message")
      .setDescription("Export a specific message from this server")
      .addStringOption((o) => o.setName("message").setDescription("The message id or URL that you want to export").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("reactions")
      .setDescription("Export a list of reactions from a specific message")
      .addStringOption((o) => o.setName("message").setDescription("The message id or URL").setRequired(true))
      .addStringOption((o) => o.setName("format").setDescription("The file format. Either json or csv").addChoices({ name: "json", value: "json" }, { name: "csv", value: "csv" }))
  );

const rd = 0xc63a35;

async function sendFile(interaction: ChatInputCommandInteraction, filename: string, content: string): Promise<void> {
  const buf = Buffer.from(content, "utf8");
  await interaction.reply({ files: [{ attachment: buf, name: filename }], flags: V2E });
}

function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;
  const format = interaction.options.getString("format") ?? "json";
  const isCSV = format === "csv";

  try {
    switch (sub) {
      case "guild": {
        const d = {
          name: guild.name,
          id: guild.id,
          description: guild.description,
          verificationLevel: guild.verificationLevel,
          defaultMessageNotifications: guild.defaultMessageNotifications,
          explicitContentFilter: guild.explicitContentFilter,
          preferredLocale: guild.preferredLocale,
          icon: guild.iconURL({ extension: "png" }),
          roles: guild.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position, permissions: r.permissions.toArray() })),
          channels: guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
          emojis: guild.emojis.cache.map((e) => ({ id: e.id, name: e.name })),
          stickers: guild.stickers.cache.map((s) => ({ id: s.id, name: s.name })),
        };
        await sendFile(interaction, `guild-${guild.id}.json`, JSON.stringify(d, null, 2));
        return;
      }
      case "channels": {
        const rows = [["id", "name", "type", "parent"]];
        for (const c of guild.channels.cache.values()) rows.push([c.id, c.name, String(c.type), c.parentId ?? ""]);
        await sendFile(interaction, `channels.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })), null, 2));
        return;
      }
      case "channel": {
        const ch = interaction.options.getChannel("channel") ?? interaction.channel;
        const d = ch ? { id: ch.id, name: "name" in ch ? ch.name : undefined, type: ch.type, parentId: (ch as any).parentId } : {};
        await sendFile(interaction, `channel.json`, JSON.stringify(d, null, 2));
        return;
      }
      case "roles": {
        const rows = [["id", "name", "color", "position", "permissions"]];
        for (const r of guild.roles.cache.values()) rows.push([r.id, r.name, r.hexColor, String(r.position), r.permissions.toArray().join(";")]);
        await sendFile(interaction, `roles.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(guild.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions.toArray() })), null, 2));
        return;
      }
      case "role": {
        const role = interaction.options.getRole("role");
        if (!role) {
          await interaction.reply({ components: [st("Error", rd, "No role provided.")], flags: V2E });
          return;
        }
        const d = { id: role.id, name: role.name, color: role.color, hoist: role.hoist, position: role.position, permissions: (role.permissions as any).toArray() };
        await sendFile(interaction, `role-${role.id}.json`, JSON.stringify(d, null, 2));
        return;
      }
      case "bans": {
        const bans = await guild.bans.fetch();
        const rows = [["id", "username", "reason"]];
        for (const b of bans.values()) rows.push([b.user.id, b.user.username, b.reason ?? ""]);
        await sendFile(interaction, `bans.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(bans.map((b) => ({ id: b.user.id, username: b.user.username, reason: b.reason })), null, 2));
        return;
      }
      case "message":
      case "reactions": {
        const raw = interaction.options.getString("message")!;
        const id = raw.split("/").pop() ?? raw;
        const channel = interaction.channel ?? guild.channels.cache.find((c) => c.isTextBased());
        if (!channel || !(channel as any).isTextBased) {
          await interaction.reply({ components: [st("Error", rd, "This command must be used in a text channel.")], flags: V2E });
          return;
        }
        const msg = await (channel as any).messages.fetch(id).catch(() => null);
        if (!msg) {
          await interaction.reply({ components: [st("Error", rd, "Message not found. Make sure to run this in the same channel as the message.")], flags: V2E });
          return;
        }
        if (sub === "message") {
          const d = { id: msg.id, author: msg.author?.username, content: msg.content, createdAt: msg.createdTimestamp, attachments: msg.attachments.map((a: any) => a.url) };
          await sendFile(interaction, `message-${msg.id}.json`, JSON.stringify(d, null, 2));
        } else {
          const rows = [["emoji", "count", "users"]];
          for (const r of msg.reactions.cache.values()) {
            const users = await r.users.fetch().catch(() => new Collection());
            rows.push([r.emoji.name ?? r.emoji.id, String(r.count), (users as any).map((u: any) => u.username).join(";")]);
          }
          await sendFile(interaction, `reactions.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(msg.reactions.cache.map((r: any) => ({ emoji: r.emoji.name ?? r.emoji.id, count: r.count })), null, 2));
        }
        return;
      }
      default:
        return;
    }
  } catch (err) {
    console.error("[export] failed", err);
    await interaction.reply({ components: [st("Error", rd, "An error occurred during the export.")], flags: V2E });
  }
}
