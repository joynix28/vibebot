import { SlashCommandBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { row, btn, st, td, V2E } from "../../func/ui.ts";
import { ownAdd, ownList, ownDel, aud, ACT, permLvl } from "../../func/db.ts";
import bk from "dis-backups";

export const data = new SlashCommandBuilder()
  .setName("clipboard")
  .setDescription("Sauvegarder et charger ton presse-papiers serveur")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const PFX = "clipboard-";

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("clipboard:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Copier")
        .setValue("copy")
        .setDescription("Sauvegarde ce serveur dans ton presse-papiers")
        .setEmoji("📋"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Coller")
        .setValue("paste")
        .setDescription("Charge le presse-papiers sur ce serveur")
        .setEmoji("📌"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir")
        .setValue("view")
        .setDescription("Voir le contenu de ton presse-papiers")
        .setEmoji("👁️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Effacer")
        .setValue("clear")
        .setDescription("Vide ton presse-papiers")
        .setEmoji("🗑️")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📋 Presse-papiers\nSauvegarde et charge des serveurs comme un copier-coller.\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function clipId(): string {
  return `${PFX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Même logique que canUse (func/permCheck.ts), adaptée aux interactions composants.
function canUseComponent(interaction: MessageComponentInteraction, destructive: boolean): boolean {
  const guild = interaction.guild;
  if (!guild) return false;
  if (interaction.user.id === guild.ownerId) return true;
  const lvl = permLvl(guild.id);
  if (lvl === "owner") return false;
  if (lvl === "safe" && destructive) return false;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has?.("Administrator") ?? false;
}

async function doClear(interaction: MessageComponentInteraction): Promise<void> {
  const uid = interaction.user.id;
  for (const id of ownList(uid).filter((x) => x.startsWith(PFX))) {
    ownDel(uid, id);
  }
  await interaction.update({ components: [st("Success", gr, "You **clipboard has been cleared**.")] });
}

async function doView(interaction: MessageComponentInteraction): Promise<void> {
  const uid = interaction.user.id;
  const id = ownList(uid).find((x) => x.startsWith(PFX));
  if (!id) {
    await interaction.update({ components: [st("Error", rd, "Your clipboard is empty. Use the copy action first.")] });
    return;
  }
  await interaction.update({
    components: [st("Info", bl, `**Your clipboard** contains a backup of a server.`, row(btn(`clipboard:paste?${id}`, "Paste here", ButtonStyle.Primary), btn(`clipboard:clear?${id}`, "Clear", ButtonStyle.Danger)))],
  });
}

async function doCopy(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  const uid = interaction.user.id;
  if (!guild) return;
  const msgCount = 100;
  await interaction.deferUpdate();

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
      components: [st("Success", gr, "Successfully **copied this server to the clipboard**. Your clipboard will be automatically cleared after one hour.")],
    });
  } catch (err) {
    console.error("[clipboard] copy failed", err);
    await interaction.editReply({ components: [st("Error", rd, "An error occurred while copying the server.")] });
  }
}

async function doPaste(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  const uid = interaction.user.id;
  if (!guild) return;
  if (!canUseComponent(interaction, true)) {
    await interaction.update({ components: [td("You do not have permission to use this command on this server.")] });
    return;
  }
  const id = ownList(uid).find((x) => x.startsWith(PFX));
  if (!id) {
    await interaction.update({ components: [st("Error", rd, "Your clipboard is empty. Use the copy action first.")] });
    return;
  }
  await interaction.update({
    components: [st("Warning", og, "Loading the server from your clipboard will replace all channels and roles on this server. **This cannot be undone.**", row(btn(`clipboard:paste_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`clipboard:paste_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  // Hub menu
  if (cid === "clipboard:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "copy") {
      await doCopy(interaction);
      return;
    }
    if (action === "paste") {
      await doPaste(interaction);
      return;
    }
    if (action === "view") {
      await doView(interaction);
      return;
    }
    if (action === "clear") {
      await doClear(interaction);
      return;
    }
    return;
  }

  const [action, payload = ""] = cid.split("?");
  const uid = interaction.user.id;
  const guild = interaction.guild;
  if (!guild) return;

  const id = payload;
  const isOwner = id ? ownList(uid).includes(id) : false;

  if (action === "clipboard:paste_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, "Your clipboard is empty. Use the copy action first.")], flags: V2E });
      return;
    }
    await interaction.update({ components: [st("Info", bl, "**The backup will start loading now**. Please be patient, this can take a while!\n\n*This message might not be updated.*", row(btn("backup:status_direct", "View Status", ButtonStyle.Primary)))] });
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
      await interaction.update({ components: [st("Error", rd, "Your clipboard is empty. Use the copy action first.")] });
      return;
    }
    await interaction.update({ components: [st("Info", bl, "**The backup will start loading now**. Please be patient, this can take a while!", row(btn("backup:status_direct", "View Status", ButtonStyle.Primary)))] });
    try {
      await bk.load(id, guild, { clearGuildBeforeRestore: true });
      await interaction.editReply({ components: [st("Success", gr, "Successfully **loaded clipboard**.")], flags: V2E }).catch(() => {});
    } catch (err) {
      console.error("[clipboard] paste failed", err);
      await interaction.editReply({ components: [st("Error", rd, "An error occurred while loading the clipboard.")], flags: V2E }).catch(() => {});
    }
  }
}
