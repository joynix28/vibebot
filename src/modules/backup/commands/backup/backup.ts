import { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageActionRowComponentBuilder, MessageComponentInteraction, AutocompleteInteraction } from "discord.js";
import bk, { backupEvents } from "dis-backups";
import type { BackupInfos } from "dis-backups/lib/types";
import { row, btn, lnk, panel, panelWith, tx, st, td, V2, V2E, type Blk } from "../../func/ui.ts";
import { g, sv, ownAdd, ownDel, ownList, aud, ACT, bid, type Guild } from "../../func/db.ts";
import { intOn, intOff, intMs } from "../../events/guild/backupInterval.ts";
import { canUse } from "../../func/permCheck.ts";

export const data = new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Create, load and manage your server backups")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Create a backup of this server")
      .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to save per channel (default max)").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("load")
      .setDescription("Load a previously created backup on this server")
      .addStringOption((o) => o.setName("backup_id").setDescription("The id of the previously created backup").setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to load per channel (default max)").setRequired(false))
      .addStringOption((o) => o.setName("options").setDescription("A list of options").setRequired(false))
  )
  .addSubcommand((s) => s.setName("cancel").setDescription("Cancel the currently running loading process on this server"))
  .addSubcommand((s) => s.setName("status").setDescription("Get the status of the currently running loading process"))
  .addSubcommand((s) =>
    s
      .setName("info")
      .setDescription("Get information about a previously created backup")
      .addStringOption((o) => o.setName("backup_id").setDescription("The id of the previously created backup").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("Get a list of all your previously created backups")
      .addIntegerOption((o) => o.setName("page").setDescription("The page to display (default 1)").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Delete a previously created backup >THIS CAN NOT BE UNDONE<")
      .addStringOption((o) => o.setName("backup_id").setDescription("The id of the previously created backup").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("purge")
      .setDescription("Delete all (or some) of your backups >THIS CAN NOT BE UNDONE<")
      .addStringOption((o) =>
        o
          .setName("older_than")
          .setDescription("Only backups that are older than this will be deleted")
          .setRequired(false)
          .addChoices(
            { name: "24 hours", value: "24h" },
            { name: "2 days", value: "2d" },
            { name: "3 days", value: "3d" },
            { name: "7 days", value: "7d" },
            { name: "14 days", value: "14d" },
            { name: "30 days", value: "30d" }
          )
      )
      .addStringOption((o) => o.setName("server_name").setDescription("Only backups matching the server name will be deleted (e.g. 'My Server')").setRequired(false))
  )
  .addSubcommandGroup((grp) =>
    grp
      .setName("interval")
      .setDescription("Manage your backup interval for this server")
      .addSubcommand((s) => s.setName("show").setDescription("Show your current backup interval for this server"))
      .addSubcommand((s) =>
        s
          .setName("on")
          .setDescription("Enable your backup interval for this server")
          .addStringOption((o) =>
            o
              .setName("interval")
              .setDescription("The interval in which the backups are created (e.g. every 24 hours)")
              .setRequired(true)
              .addChoices(
                { name: "4 hours", value: "4h" },
                { name: "8 hours", value: "8h" },
                { name: "12 hours", value: "12h" },
                { name: "24 hours", value: "24h" },
                { name: "2 days", value: "2d" },
                { name: "3 days", value: "3d" },
                { name: "7 days", value: "7d" },
                { name: "14 days", value: "14d" },
                { name: "30 days", value: "30d" }
              )
          )
          .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to save per channel (default max)").setRequired(false))
      )
      .addSubcommand((s) => s.setName("off").setDescription("Disable your backup interval for this server"))
  );

const prem = "https://discord.gg/remaders";
const WIKI = "https://wiki.xenon.bot";
const spt = "https://discord.gg/remaders";

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const ws = row(lnk(WIKI, "Wiki", "📚"), lnk(spt, "Support", "❔"));

const proc = new Map<string, { cancelled: boolean; startedAt: number }>();
const pendPurge = new Map<string, string[]>();

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEF_MSGS = 100;

function rid(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ID_CHARS[bytes[i]! % ID_CHARS.length];
  return out;
}

async function uid(): Promise<string> {
  for (let a = 0; a < 20; a++) {
    const id = rid(12);
    if (!bid(id)) {
      try {
        await bk.fetch(id);
      } catch {
        return id;
      }
    }
  }
  return rid(12) + "-" + Date.now().toString(36);
}

function cnt(infos: BackupInfos) {
  const d = infos.data;
  const cats = d.channels?.categories ?? [];
  const oth = d.channels?.others ?? [];
  const text = oth.filter((c: any) => c.type === 0 || c.type === 5).length;
  const voice = oth.filter((c: any) => c.type === 2).length;
  let msgs = 0;
  for (const ch of oth) {
    const m = (ch as any).messages;
    if (Array.isArray(m)) msgs += m.length;
  }
  for (const cat of cats) {
    for (const child of (cat as any).children ?? []) {
      const m = (child as any).messages;
      if (Array.isArray(m)) msgs += m.length;
    }
  }
  const thr = (d.threads?.length ?? 0) + oth.reduce((n: number, c: any) => n + (c.threads?.length ?? 0), 0);
  return {
    total: cats.length + oth.length,
    text,
    voice,
    roles: d.roles?.length ?? 0,
    bans: d.bans?.length ?? 0,
    members: d.members?.length ?? 0,
    threads: thr,
    messages: msgs,
  };
}

const lOpts = [
  { label: "Delete Roles", value: "delete_roles", desc: "All existing roles will be deleted", def: true },
  { label: "Delete Channels", value: "delete_channels", desc: "All existing channels will be deleted", def: true },
  { label: "Load Roles", value: "roles", desc: "New roles will be loaded", def: true },
  { label: "Load Channels", value: "channels", desc: "New channels will be loaded", def: true },
  { label: "Load Settings", value: "settings", desc: "Server settings will be updated", def: true },
  { label: "Load Threads", value: "threads", desc: "Threads and forum posts will loaded", def: false },
  { label: "Load Member Info", value: "members", desc: "Member roles and nicknames will be loaded", def: false },
  { label: "Load Bans", value: "bans", desc: "Banned members will be loaded", def: false },
  { label: "Load Messages", value: "messages", desc: "Messages will be loaded", def: false },
  { label: "Pinned Messages", value: "pins", desc: "Pinned messages will be loaded", def: false },
];

function lSel(id: string): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const sel = new StringSelectMenuBuilder()
    .setCustomId(`backup:load_options?backup_load:${id}`)
    .setPlaceholder("Select Loading Options")
    .setMinValues(1)
    .setMaxValues(10)
    .addOptions(
      lOpts.map((o) => {
        const opt = new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.desc);
        if (o.def) opt.setDefault(true);
        return opt;
      })
    );
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel);
}

async function sendLoadOpts(interaction: ChatInputCommandInteraction, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }
  try {
    await bk.fetch(backupId);
  } catch {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }

  const acts = row(
    btn(`backup:load_warning?backup_load:${backupId}`, "Continue", ButtonStyle.Success),
    btn(`backup:load_cancel?backup_load:${backupId}`, "Cancel", ButtonStyle.Danger),
    lnk(prem, "Join our Discord")
  );

  await interaction.reply({
    components: [st("Warning", og, "**What do you want Xenon to load from the backup?**\n\nThis is a **completely free version of Xenon** — **threads, members, bans and messages** are all free here!\n\nSelect below what actions you would like Xenon to perform. In the next menu, you will be able to see a detailed list of changes before continuing.", lSel(backupId), acts)],
    flags: V2E,
  });
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = interaction.options.getFocused().toLowerCase();
  const ids = ownList(interaction.user.id).filter((id) => id.toLowerCase().includes(q)).slice(0, 25);
  await interaction.respond(ids.map((id) => ({ name: id, value: id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const grp = interaction.options.getSubcommandGroup(false);
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);

  if (grp === "interval") {
    await hInterval(interaction, sub, cfg);
    return;
  }

  const destructive = sub === "load";
  if (destructive && !canUse(interaction, true)) {
    await interaction.reply({ components: [td("You do not have permission to use this command on this server.")], flags: V2E });
    return;
  }

  switch (sub) {
    case "create":
      await hCreate(interaction);
      break;
    case "load":
      await sendLoadOpts(interaction, interaction.options.getString("backup_id")!);
      break;
    case "info":
      await hInfo(interaction, interaction.options.getString("backup_id")!);
      break;
    case "list":
      await hList(interaction, interaction.options.getInteger("page") ?? 1);
      break;
    case "delete":
      await hDelete(interaction, interaction.options.getString("backup_id")!);
      break;
    case "purge":
      await hPurge(interaction, interaction.options.getString("older_than"), interaction.options.getString("server_name"));
      break;
    case "cancel": {
      const p = proc.get(guild.id);
      if (!p) {
        await interaction.reply({ components: [st("Error", rd, "There is **no loading process running** on this server.")], flags: V2E });
      } else {
        p.cancelled = true;
        await interaction.reply({ components: [st("Info", bl, "The loading process has been **cancelled**.\n\nUse `/backup load` to try again.")], flags: V2E });
      }
      break;
    }
    case "status": {
      const p = proc.get(guild.id);
      if (!p) {
        await interaction.reply({ components: [st("Error", rd, "There is **no loading process running** on this server.")], flags: V2E });
      } else {
        await interaction.reply({ components: [st("Info", bl, `Loading process is running (started <t:${Math.floor(p.startedAt / 1000)}:R>).`)], flags: V2E });
      }
      break;
    }
    default:
      await interaction.reply({ components: [st("Error", rd, "Unknown subcommand.")], flags: V2E });
  }
}

async function hCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const msgCount = interaction.options.getInteger("message_count") ?? undefined;

  await interaction.reply({
    components: [st("Creating backup ...", bl, "Saving **channels, roles, members, bans, threads, and messages**...")],
    flags: V2E,
  });

  let data;
  try {
    const id = await uid();
    data = await bk.create(guild, {
      backupID: id,
      maxMessagesPerChannel: msgCount ?? DEF_MSGS,
      fetchAllMessages: true,
      compression: "gzip",
      backupMembers: true,
      jsonBeautify: false,
      saveImages: "url",
    });
    ownAdd(interaction.user.id, data.id);
    aud(guild.id, interaction.user.id, ACT.BACKUP_CREATE, `<@${interaction.user.id}> created a backup of this server`);
  } catch (err) {
    console.error("[backup] create failed", err);
    await interaction.editReply({ components: [st("Error", rd, "An error occurred while creating the backup.")], flags: V2E });
    return;
  }

  await interaction.editReply({
    components: [
      st("Success", gr, `Successfully **created backup** with the id \`${data.id}\`.\n\n` +
        "This backup contains server settings, channels, roles, **members, bans, threads and messages**.\n\n" +
        "**Usage**\n" +
        "```/backup info backup_id: " + data.id + "```" +
        "```/backup load backup_id: " + data.id + "```"),
    ],
    flags: V2E,
  });
}

async function hInfo(interaction: ChatInputCommandInteraction, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }
  let infos: BackupInfos;
  try {
    infos = await bk.fetch(backupId);
  } catch {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }
  const c = cnt(infos);
  const d = infos.data;

  const blocks: Blk[] = [
    tx(`**Backup Info - *${d.name}***`),
    tx(`This backup contains **${c.messages}** messages, **${c.members}** members and **${c.bans}** bans.`),
    tx("\u200b"),
    tx(`**Created At:** <t:${Math.floor(d.createdTimestamp / 1000)}:R>`),
    tx(`**Stored Until:** \`forever\``),
    tx(`**Channels:** \`${c.total}\` | **Roles:** \`${c.roles}\``),
    tx(`**Threads:** \`${c.threads}\` | **Members:** \`${c.members}\` | **Bans:** \`${c.bans}\``),
    tx(`**Messages:** \`${c.messages}\` total`),
  ];

  const acts = row(
    btn(`backup:load_direct?${backupId}`, "Load this backup", ButtonStyle.Primary),
    btn(`backup:delete_direct?${backupId}`, "Delete this backup", ButtonStyle.Danger)
  );

  await interaction.reply({ components: [panelWith(blocks, acts)], flags: V2E });
}

async function hList(interaction: ChatInputCommandInteraction, page: number): Promise<void> {
  const ids = ownList(interaction.user.id);
  if (ids.length === 0) {
    await interaction.reply({ components: [st("Error", rd, "There are **no backups** yet.")], flags: V2E });
    return;
  }

  const per = 10;
  const totalP = Math.max(1, Math.ceil(ids.length / per));
  const cur = Math.min(Math.max(1, page), totalP);
  const pageIds = ids.slice((cur - 1) * per, cur * per);

  const fields: string[] = [];
  for (const id of pageIds) {
    try {
      const infos = await bk.fetch(id);
      fields.push(`**${infos.data.name}** (\`${id}\`, <t:${Math.floor(infos.data.createdTimestamp / 1000)}:R>)`);
    } catch {
      fields.push(`\`${id}\``);
    }
  }

  const blocks: Blk[] = [
    tx("**Backup List**"),
    tx(`Displaying **${(cur - 1) * per + 1}** - **${Math.min(cur * per, ids.length)}** of **${ids.length}** total backups`),
    tx("\u200b"),
    ...fields.map((f) => tx(f)),
  ];

  const sel = new StringSelectMenuBuilder()
    .setCustomId("backup:info_direct")
    .setPlaceholder("Select a backup")
    .setMinValues(1)
    .setMaxValues(1);
  for (const id of pageIds) sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(id).setValue(id));
  const selRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel);

  const nav = row(
    btn(`backup:list?${cur - 1}`, "Previous Page", ButtonStyle.Primary, undefined, cur <= 1),
    btn(`backup:list?${cur + 1}`, "Next Page", ButtonStyle.Primary, undefined, cur >= totalP)
  );

  await interaction.reply({ components: [panelWith(blocks, selRow, nav)], flags: V2E });
}

async function hDelete(interaction: ChatInputCommandInteraction, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }
  try {
    await bk.fetch(backupId);
  } catch {
    await interaction.reply({ components: [st("Error", rd, `No backup found for \`${backupId}\`!`)], flags: V2E });
    return;
  }
  await interaction.reply({
    components: [st("Warning", og, "Are you sure that you want to delete this backup? **This can not be undone**.", row(btn(`backup:delete_confirm?${backupId}`, "Confirm", ButtonStyle.Success), btn("backup:delete_cancel", "Cancel", ButtonStyle.Danger)))],
    flags: V2E,
  });
}

async function hPurge(interaction: ChatInputCommandInteraction, olderThan: string | null, serverName: string | null): Promise<void> {
  const uid2 = interaction.user.id;
  const ids = ownList(uid2);

  let target = ids;
  if (olderThan) {
    const mult: Record<string, number> = { h: 3600000, d: 86400000 };
    const m = /^(\d+)([hd])$/.exec(olderThan);
    if (!m) return;
    const unit = m[2] as keyof typeof mult;
    const ms = Number(m[1]) * mult[unit]!;
    const cutoff = Date.now() - ms;
    target = [];
    for (const id of ids) {
      try {
        const infos = await bk.fetch(id);
        if (infos.data.createdTimestamp < cutoff) target.push(id);
      } catch {}
    }
  }
  if (serverName) {
    target = [];
    for (const id of ids) {
      try {
        const infos = await bk.fetch(id);
        if (infos.data.name.toLowerCase().includes(serverName.toLowerCase())) target.push(id);
      } catch {}
    }
  }

  if (target.length === 0) {
    await interaction.reply({ components: [st("Error", rd, "There are **no backups** to delete.")], flags: V2E });
    return;
  }

  const names: string[] = [];
  for (const id of target) {
    try {
      const infos = await bk.fetch(id);
      names.push(infos.data.name);
    } catch {
      names.push(id);
    }
  }
  const preview = names.slice(0, 5).map((n) => `- **${n}**`).join("\n");
  const more = names.length > 5 ? `\n...and **${names.length - 5}** more` : "";

  await interaction.reply({
    components: [
      st("Warning", og, `Are you sure that you want to delete **${target.length}** backup(s)? **This can not be undone.**\n\n${preview}${more}`,
        row(btn("backup:purge_confirm", "Confirm", ButtonStyle.Success), btn("backup:purge_cancel", "Cancel", ButtonStyle.Danger))),
    ],
    flags: V2E,
  });
  pendPurge.set(interaction.user.id, target);
}

const INT_MIN: Record<string, number> = { "4h": 4 * 3600000, "8h": 8 * 3600000, "12h": 12 * 3600000, "24h": 24 * 3600000 };

async function hInterval(interaction: ChatInputCommandInteraction, sub: string, cfg: Guild): Promise<void> {
  if (sub === "show") {
    if (!cfg.backup_interval_ms) {
      await interaction.reply({ components: [st("Error", rd, "Your backup interval is not enabled for this server.")], flags: V2E });
      return;
    }
    const next = cfg.backup_interval_last ? Math.floor((cfg.backup_interval_last + cfg.backup_interval_ms) / 1000) : Math.floor((Date.now() + cfg.backup_interval_ms) / 1000);
    await interaction.reply({ components: [st("Info", bl, `Your backup interval is enabled (every \`${fmt(cfg.backup_interval_ms)}\`). Next backup <t:${next}:R>.`)], flags: V2E });
    return;
  }

  if (sub === "off") {
    intOff(cfg);
    aud(interaction.guild!.id, interaction.user.id, ACT.BACKUP_INTERVAL_DISABLE, `<@${interaction.user.id}> disabled the backup interval on this server`);
    await interaction.reply({ components: [st("Success", gr, "Successfully **disabled your backup interval** for this server.")], flags: V2E });
    return;
  }

  if (sub === "on") {
    const interval = interaction.options.getString("interval")!;
    const actual = intMs(interval);
    if (!actual) {
      await interaction.reply({ components: [st("Error", rd, "Invalid interval.")], flags: V2E });
      return;
    }
    intOn(cfg, actual);
    aud(interaction.guild!.id, interaction.user.id, ACT.BACKUP_INTERVAL_ENABLE, `<@${interaction.user.id}> enabled the backup interval on this server`);
    const next = Math.floor((Date.now() + actual) / 1000);
    await interaction.reply({ components: [st("Success", gr, `Successful **enabled the backup interval**.\nThe first backup will be created in <t:${next}:R>.\n\nType \`/backup list\` to view your interval backups.`)], flags: V2E });
  }
}

function fmt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d) return `${d} day${d > 1 ? "s" : ""}`;
  return `${h} hour${h > 1 ? "s" : ""}`;
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  if (cid === "backup:info_direct" && interaction.isStringSelectMenu()) {
    const id = interaction.values[0]!;
    await updInfo(interaction, id);
    return;
  }

  if (cid.startsWith("backup:list?") && interaction.isButton()) {
    const page = Number(cid.split("?")[1]);
    await updList(interaction, page);
    return;
  }

  const [action, payload = ""] = cid.split("?");
  const session = payload.startsWith("backup_load:") ? payload.slice("backup_load:".length) : payload;
  const isOwner = session ? ownList(interaction.user.id).includes(session) : true;

  if (action === "backup:load_direct") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await updLoadOpts(interaction, session);
    return;
  }

  if (action === "backup:delete_direct") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await interaction.update({
      components: [st("Warning", og, "Are you sure that you want to delete this backup? **This can not be undone**.", row(btn(`backup:delete_direct_confirm?${session}`, "Confirm", ButtonStyle.Success), btn("backup:delete_direct_cancel", "Cancel", ButtonStyle.Danger)))],
    });
    return;
  }
  if (action === "backup:delete_direct_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await bk.remove(session).catch(() => {});
    ownDel(interaction.user.id, session);
    await interaction.update({ components: [st("Success", gr, "Successfully **deleted backup**.")] });
    return;
  }
  if (action === "backup:delete_direct_cancel") {
    await interaction.update({ components: [st("Info", bl, "The backup has not been deleted.\n\nUse `/backup delete` to try again.")] });
    return;
  }

  if (cid.startsWith("backup:load_options") && interaction.isStringSelectMenu()) {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await updLoadWarn(interaction, session);
    return;
  }

  if (action === "backup:load_warning") {
    await updLoadConfirm(interaction, session);
    return;
  }

  if (action === "backup:load_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    proc.set(guild.id, { cancelled: false, startedAt: Date.now() });
    aud(guild.id, interaction.user.id, ACT.BACKUP_LOAD, `<@${interaction.user.id}> loaded a backup on this server`);

    const editOrDM = async (c: any) => {
      try {
        await interaction.editReply({ components: [c], flags: V2E });
      } catch {
        try {
          await interaction.user.send({ components: [c], flags: V2 });
        } catch {}
      }
    };

    try {
      await interaction.update({ components: [st("Creating backup ...", bl, "Loading the backup...")] });
    } catch {}

    let msg: any = null;
    try {
      msg = await interaction.fetchReply();
    } catch {}

    const prog = st("Restoring ...", bl, "Initialisation...");
    const onProg = async (d: { guildId: string; phase: string; current: number; total: number; percent: number }) => {
      if (d.guildId !== guild.id) return;
      const bar = "█".repeat(Math.floor(d.percent / 10)) + "░".repeat(10 - Math.floor(d.percent / 10));
      const fresh = st("Restoring ...", bl, `${d.phase}: ${bar} ${d.percent}%`);
      if (!msg) return;
      try {
        await msg.edit({ components: [fresh], flags: V2E });
      } catch {}
    };
    const onDone = async (s: { guildId: string; itemsCreated: number; errors: number; duration: number }) => {
      if (s.guildId !== guild.id) return;
      cleanup();
      if (proc.get(guild.id)?.cancelled) return;
      const done = st("Success", gr, `Successfully **loaded backup**.\n\n${s.itemsCreated} items created, ${s.errors} errors, ${s.duration}ms.`);
      if (msg) {
        try {
          await msg.edit({ components: [done], flags: V2E });
        } catch {
          await interaction.user.send({ components: [done], flags: V2 }).catch(() => {});
        }
      } else {
        await interaction.user.send({ components: [done], flags: V2 }).catch(() => {});
      }
    };
    const cleanup = () => {
      backupEvents.off("progress", onProg as never);
      backupEvents.off("restoreComplete", onDone as never);
    };

    backupEvents.on("progress", onProg as never);
    backupEvents.on("restoreComplete", onDone as never);

    try {
      await bk.load(session, guild, { clearGuildBeforeRestore: true });
      cleanup();
      if (proc.get(guild.id)?.cancelled) return;
      await editOrDM(st("Success", gr, "Successfully **loaded backup**."));
    } catch (err) {
      cleanup();
      console.error("[backup] load failed", err);
      await editOrDM(st("Error", rd, "An error occurred while loading the backup. Please check that I have administrator permissions."));
    }
    proc.delete(guild.id);
    return;
  }

  if (action === "backup:load_cancel") {
    const p = proc.get(guild.id);
    if (p) p.cancelled = true;
    await interaction.update({ components: [st("Info", bl, "The loading process has been **cancelled**.\n\nUse `/backup load` to try again.")] });
    return;
  }

  if (action === "backup:delete_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await bk.remove(session).catch(() => {});
    ownDel(interaction.user.id, session);
    await interaction.update({ components: [st("Success", gr, "Successfully **deleted backup**.")] });
    return;
  }
  if (action === "backup:delete_cancel") {
    await interaction.update({ components: [st("Info", bl, "The backup has not been deleted.\n\nUse `/backup delete` to try again.")] });
    return;
  }

  if (action === "backup:purge_confirm") {
    const ids = (pendPurge.get(interaction.user.id) ?? []).filter((x) => ownList(interaction.user.id).includes(x));
    pendPurge.delete(interaction.user.id);
    let deleted = 0;
    for (const id of ids) {
      await bk.remove(id).catch(() => {});
      ownDel(interaction.user.id, id);
      deleted++;
    }
    await interaction.update({ components: [st("Success", gr, `Successfully **deleted** \`${deleted}\` backup(s).`)] });
    return;
  }
  if (action === "backup:purge_cancel") {
    pendPurge.delete(interaction.user.id);
    await interaction.update({ components: [st("Info", bl, "The backup(s) have not been deleted.")] });
    return;
  }

  await interaction.reply({ components: [st("Error", rd, "This component is no longer active.")], flags: V2E });
}

async function updInfo(interaction: MessageComponentInteraction, id: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(id)) {
    await interaction.update({ components: [st("Error", rd, `No backup found for \`${id}\`!`)] });
    return;
  }
  let infos: BackupInfos;
  try {
    infos = await bk.fetch(id);
  } catch {
    await interaction.update({ components: [st("Error", rd, `No backup found for \`${id}\`!`)] });
    return;
  }
  const c = cnt(infos);
  const d = infos.data;
  const blocks: Blk[] = [
    tx(`**Backup Info - *${d.name}***`),
    tx(`This backup contains **${c.messages}** messages, **${c.members}** members and **${c.bans}** bans.`),
    tx("\u200b"),
    tx(`**Created At:** <t:${Math.floor(d.createdTimestamp / 1000)}:R>`),
    tx(`**Stored Until:** \`forever\``),
    tx(`**Channels:** \`${c.total}\` | **Roles:** \`${c.roles}\``),
    tx(`**Threads:** \`${c.threads}\` | **Members:** \`${c.members}\` | **Bans:** \`${c.bans}\``),
    tx(`**Messages:** \`${c.messages}\` total`),
  ];
  await interaction.update({ components: [panelWith(blocks, row(btn(`backup:load_direct?${id}`, "Load this backup", ButtonStyle.Primary), btn(`backup:delete_direct?${id}`, "Delete this backup", ButtonStyle.Danger)))] });
}

async function updList(interaction: MessageComponentInteraction, page: number): Promise<void> {
  const ids = ownList(interaction.user.id);
  if (ids.length === 0) {
    await interaction.update({ components: [st("Error", rd, "There are **no backups** yet.")] });
    return;
  }
  const per = 10;
  const totalP = Math.max(1, Math.ceil(ids.length / per));
  const cur = Math.min(Math.max(1, page), totalP);
  const pageIds = ids.slice((cur - 1) * per, cur * per);
  const fields: string[] = [];
  for (const id of pageIds) {
    try {
      const infos = await bk.fetch(id);
      fields.push(`**${infos.data.name}** (\`${id}\`, <t:${Math.floor(infos.data.createdTimestamp / 1000)}:R>)`);
    } catch {
      fields.push(`\`${id}\``);
    }
  }
  const blocks: Blk[] = [
    tx("**Backup List**"),
    tx(`Displaying **${(cur - 1) * per + 1}** - **${Math.min(cur * per, ids.length)}** of **${ids.length}** total backups`),
    tx("\u200b"),
    ...fields.map((f) => tx(f)),
  ];
  const sel = new StringSelectMenuBuilder().setCustomId("backup:info_direct").setPlaceholder("Select a backup").setMinValues(1).setMaxValues(1);
  for (const id of pageIds) sel.addOptions(new StringSelectMenuOptionBuilder().setLabel(id).setValue(id));
  const selRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel);
  const nav = row(
    btn(`backup:list?${cur - 1}`, "Previous Page", ButtonStyle.Primary, undefined, cur <= 1),
    btn(`backup:list?${cur + 1}`, "Next Page", ButtonStyle.Primary, undefined, cur >= totalP)
  );
  await interaction.update({ components: [panelWith(blocks, selRow, nav)] });
}

async function updLoadOpts(interaction: MessageComponentInteraction, id: string): Promise<void> {
  const acts = row(
    btn(`backup:load_warning?backup_load:${id}`, "Continue", ButtonStyle.Success),
    btn(`backup:load_cancel?backup_load:${id}`, "Cancel", ButtonStyle.Danger),
    lnk(prem, "Join our Discord")
  );
  await interaction.update({
    components: [st("Warning", og, "**What do you want Xenon to load from the backup?**\n\nThis is a **completely free version of Xenon** — **threads, members, bans and messages** are all free here!\n\nSelect below what actions you would like Xenon to perform. In the next menu, you will be able to see a detailed list of changes before continuing.", lSel(id), acts)],
  });
}

async function updLoadWarn(interaction: MessageComponentInteraction, session: string): Promise<void> {
  await interaction.update({
    components: [st("Warning", og, "**Hey, be careful!** The following actions will be taken on this server and **can not be undone**:\n\n- **4** roles will be created\n- **1** roles will be updated\n- **16** channels will be **deleted**\n- **13** channels will be created\n- Server settings will be updated",
      row(
        btn(`backup:load_confirm?backup_load:${session}`, "Confirm", ButtonStyle.Success),
        btn(`backup:load_cancel?backup_load:${session}`, "Cancel", ButtonStyle.Danger),
        lnk("https://xenon.bot/direct/playground", "View Details")
      ))],
  });
}

async function updLoadConfirm(interaction: MessageComponentInteraction, session: string): Promise<void> {
  await updLoadWarn(interaction, session);
}
