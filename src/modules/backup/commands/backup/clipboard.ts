import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { row, btn, st, td, V2E } from "../../func/ui.ts";
import { ownAdd, ownList, ownDel, aud, ACT } from "../../func/db.ts";
import { canUse } from "../../func/permCheck.ts";
import bk from "dis-backups";

export const data = new SlashCommandBuilder()
  .setName("clipboard")
  .setDescription("Save, load and manage your clipboard (similar to ctrl+c & ctrl+v)")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("copy")
      .setDescription("Save this server to your clipboard")
      .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to save per channel").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("paste")
      .setDescription("Load the server from your clipboard on this server")
      .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to load per channel").setRequired(false))
      .addStringOption((o) => o.setName("options").setDescription("A list of options").setRequired(false))
  )
  .addSubcommand((s) => s.setName("view").setDescription("View the server on your clipboard"))
  .addSubcommand((s) => s.setName("clear").setDescription("Clear your clipboard"));

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const PFX = "clipboard-";

function clipId(): string {
  return `${PFX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  const uid = interaction.user.id;

  if (sub === "clear") {
    for (const id of ownList(uid).filter((x) => x.startsWith(PFX))) {
      ownDel(uid, id);
    }
    await interaction.reply({ components: [st("Success", gr, "You **clipboard has been cleared**.")], flags: V2E });
    return;
  }

  if (sub === "view") {
    const id = ownList(uid).find((x) => x.startsWith(PFX));
    if (!id) {
      await interaction.reply({ components: [st("Error", rd, "Your clipboard is empty. Use `/clipboard copy` first.")], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Info", bl, `**Your clipboard** contains a backup of a server.\n\n**Usage**\n\`\`\`/clipboard paste\`\`\``, row(btn(`clipboard:paste?${id}`, "Paste here", ButtonStyle.Primary), btn(`clipboard:clear?${id}`, "Clear", ButtonStyle.Danger)))],
      flags: V2E,
    });
    return;
  }

  if (sub === "copy") {
    if (!guild) return;
    const msgCount = interaction.options.getInteger("message_count") ?? 100;
    await interaction.deferReply({ flags: V2E });

    for (const old of ownList(uid).filter((x) => x.startsWith(PFX))) {
      ownDel(uid, old);
    }
    const id = clipId();
    try {
      const data = await bk.create(guild, {
        backupID: id,
        maxMessagesPerChannel: msgCount,
        compression: "gzip",
        backupMembers: true,
        jsonBeautify: false,
        saveImages: "url",
      });
      ownAdd(uid, data.id);
      aud(guild.id, uid, ACT.COPY, `<@${uid}> copied this server to their clipboard`);
      await interaction.editReply({
        components: [st("Success", gr, "Successfully **copied this server to the clipboard**. Your clipboard will be automatically cleared after one hour.\n\n**Usage**\n```/clipboard view``````/clipboard paste```")],
        flags: V2E,
      });
    } catch (err) {
      console.error("[clipboard] copy failed", err);
      await interaction.editReply({ components: [st("Error", rd, "An error occurred while copying the server.")], flags: V2E });
    }
    return;
  }

  if (sub === "paste") {
    if (!canUse(interaction, true)) {
      await interaction.reply({ components: [td("You do not have permission to use this command on this server.")], flags: V2E });
      return;
    }
    const id = ownList(uid).find((x) => x.startsWith(PFX));
    if (!id) {
      await interaction.reply({ components: [st("Error", rd, "Your clipboard is empty. Use `/clipboard copy` first.")], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Warning", og, "Loading the server from your clipboard will replace all channels and roles on this server. **This cannot be undone.**", row(btn(`clipboard:paste_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`clipboard:paste_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
      flags: V2E,
    });
  }
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const [action, payload = ""] = interaction.customId.split("?");
  const uid = interaction.user.id;
  const guild = interaction.guild;
  if (!guild) return;

  const id = payload;
  const isOwner = id ? ownList(uid).includes(id) : false;

  if (action === "clipboard:paste_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, "Your clipboard is empty. Use `/clipboard copy` first.")], flags: V2E });
      return;
    }
    await interaction.update({ components: [st("Info", bl, "**The backup will start loading now**. Please be patient, this can take a while!\n\nUse `/backup status` to get the current status and `/backup cancel` to cancel the process.\n\n*This message might not be updated.*", row(btn("backup:status_direct", "View Status", ButtonStyle.Primary)))] });
    try {
      await bk.load(id, guild, { clearGuildBeforeRestore: true });
      await interaction.editReply({ components: [st("Success", gr, "Successfully **loaded clipboard**.")], flags: V2E }).catch(() => {});
    } catch (err) {
      console.error("[clipboard] paste failed", err);
      await interaction.editReply({ components: [st("Error", rd, "An error occurred while loading the clipboard.")], flags: V2E }).catch(() => {});
    }
    return;
  }
  if (action === "clipboard:paste_cancel" || action === "clipboard:clear") {
    await interaction.update({ components: [st("Info", bl, "Cancelled.")] });
    return;
  }
  if (action === "clipboard:paste") {
    if (!isOwner) {
      await interaction.update({ components: [st("Error", rd, "Your clipboard is empty. Use `/clipboard copy` first.")] });
      return;
    }
    await interaction.update({ components: [st("Info", bl, "**The backup will start loading now**. Please be patient, this can take a while!\n\nUse `/backup status` to get the current status and `/backup cancel` to cancel the process.", row(btn("backup:status_direct", "View Status", ButtonStyle.Primary)))] });
    try {
      await bk.load(id, guild, { clearGuildBeforeRestore: true });
      await interaction.editReply({ components: [st("Success", gr, "Successfully **loaded clipboard**.")], flags: V2E }).catch(() => {});
    } catch (err) {
      console.error("[clipboard] paste failed", err);
      await interaction.editReply({ components: [st("Error", rd, "An error occurred while loading the clipboard.")], flags: V2E }).catch(() => {});
    }
  }
}
