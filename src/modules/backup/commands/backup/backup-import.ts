import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { aud, ACT } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-import")
  .setDescription("Import data like channels, roles, emojis, stickers, etc. from JSON files")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("guild")
      .setDescription("Import the server settings, channels, and roles from a JSON file")
      .addAttachmentOption((o) => o.setName("json_file").setDescription("The JSON file containing the server data (Discord API format)").setRequired(true))
  );

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;

  const file = interaction.options.getAttachment("json_file");
  if (!file) {
    await interaction.reply({ components: [st("Error", rd, "Please attach a JSON file.")], flags: V2E });
    return;
  }

  await interaction.reply({ components: [st("Creating backup ...", bl, "Importing server data...")], flags: V2E });

  try {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error("Failed to download file");
    const text = await res.text();
    const data = JSON.parse(text);

    if (!data || typeof data !== "object") throw new Error("Invalid JSON");

    if (data.name) await guild.setName(String(data.name)).catch(() => {});
    if (data.verification_level !== undefined) await guild.setVerificationLevel(data.verification_level).catch(() => {});
    if (data.default_message_notifications !== undefined) await guild.setDefaultMessageNotifications(data.default_message_notifications).catch(() => {});

    if (Array.isArray(data.roles)) {
      for (const r of data.roles) {
        if (!r.name || r.name === "@everyone") continue;
        try {
          await guild.roles.create({ name: String(r.name), colors: { primaryColor: r.color ?? 0 }, hoist: r.hoist ?? false, permissions: r.permissions ?? [] });
        } catch {}
      }
    }

    if (Array.isArray(data.channels)) {
      for (const c of data.channels) {
        try {
          if (c.type === 4) await guild.channels.create({ name: String(c.name), type: 4 });
          else if (c.type === 2) await guild.channels.create({ name: String(c.name), type: 2 });
          else await guild.channels.create({ name: String(c.name), type: 0 });
        } catch {}
      }
    }

    aud(guild.id, interaction.user.id, ACT.IMPORT_GUILD, `<@${interaction.user.id}> imported guild data on this server`);
    await interaction.editReply({
      components: [st("Success", gr, "Successfully **imported** the server data.")],
      flags: V2E,
    });
  } catch (err) {
    console.error("[import] failed", err);
    await interaction.editReply({ components: [st("Error", rd, "Failed to import the file. Make sure it follows the official Discord API format for guild data.")], flags: V2E });
  }
}
