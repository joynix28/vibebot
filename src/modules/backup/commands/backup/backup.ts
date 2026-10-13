import { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageActionRowComponentBuilder, MessageComponentInteraction, ModalSubmitInteraction, AutocompleteInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import bk, { backupEvents } from "dis-backups";
import type { BackupInfos } from "dis-backups/lib/types";
import { row, btn, lnk, panel, panelWith, tx, st, td, V2, V2E, type Blk } from "../../func/ui.ts";
import { g, sv, ownAdd, ownDel, ownList, aud, ACT, bid, permLvl, type Guild } from "../../func/db.ts";
import { intOn, intOff, intMs } from "../../events/guild/backupInterval.ts";

export const data = new SlashCommandBuilder()
  .setName("backup")
  .setDescription("Créer, charger et gérer tes backups serveur")
  .setDefaultMemberPermissions(8);

const prem = "https://discord.gg/remaders";

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const proc = new Map<string, { cancelled: boolean; startedAt: number }>();
const pendPurge = new Map<string, string[]>();

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEF_MSGS = 100;

type AnyIx = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Créer un backup").setValue("create").setDescription("Sauvegarde ce serveur").setEmoji("📦"),
      new StringSelectMenuOptionBuilder().setLabel("Charger un backup").setValue("load").setDescription("Restaure un backup sur ce serveur").setEmoji("📥"),
      new StringSelectMenuOptionBuilder().setLabel("Infos backup").setValue("info").setDescription("Détails d'un backup").setEmoji("ℹ️"),
      new StringSelectMenuOptionBuilder().setLabel("Mes backups").setValue("list").setDescription("Liste tes backups").setEmoji("📋"),
      new StringSelectMenuOptionBuilder().setLabel("Supprimer").setValue("delete").setDescription("Supprime un backup").setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder().setLabel("Purger").setValue("purge").setDescription("Supprime plusieurs backups").setEmoji("🧹"),
      new StringSelectMenuOptionBuilder().setLabel("Voir l'intervalle").setValue("interval_show").setDescription("Affiche l'intervalle auto").setEmoji("⏰"),
      new StringSelectMenuOptionBuilder().setLabel("Activer l'intervalle").setValue("interval_on").setDescription("Backups automatiques réguliers").setEmoji("▶️"),
      new StringSelectMenuOptionBuilder().setLabel("Désactiver l'intervalle").setValue("interval_off").setDescription("Stoppe les backups auto").setEmoji("⏸️"),
      new StringSelectMenuOptionBuilder().setLabel("Annuler").setValue("cancel").setDescription("Annule le chargement en cours").setEmoji("🚫"),
      new StringSelectMenuOptionBuilder().setLabel("Statut").setValue("status").setDescription("État du chargement en cours").setEmoji("📊"),
      new StringSelectMenuOptionBuilder().setLabel("Aide / FAQ").setValue("faq").setDescription("Questions fréquentes sur les backups").setEmoji("❓")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📦 Backups\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function openModal(
  interaction: MessageComponentInteraction,
  customId: string,
  title: string,
  fields: { id: string; label: string; required: boolean; placeholder?: string }[]
): Promise<void> {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setStyle(TextInputStyle.Short).setRequired(f.required).setMaxLength(300);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    modal.addLabelComponents(new LabelBuilder().setLabel(f.label).setTextInputComponent(input));
  }
  return interaction.showModal(modal);
}

// Même logique que canUse (func/permCheck.ts), adaptée aux interactions composants/modals.
function canUseComponent(interaction: MessageComponentInteraction | ModalSubmitInteraction, destructive: boolean): boolean {
  const guild = interaction.guild;
  if (!guild) return false;
  if (interaction.user.id === guild.ownerId) return true;
  const lvl = permLvl(guild.id);
  if (lvl === "owner") return false;
  if (lvl === "safe" && destructive) return false;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has?.("Administrator") ?? false;
}

async function respond(ix: AnyIx, comps: any[]): Promise<void> {
  if (ix.isChatInputCommand() || ix.isModalSubmit()) {
    if (ix.replied || ix.deferred) await ix.followUp({ components: comps, flags: V2E });
    else await ix.reply({ components: comps, flags: V2E });
  } else {
    if (ix.replied || ix.deferred) await ix.followUp({ components: comps, flags: V2E });
    else await ix.update({ components: comps });
  }
}

async function deferAny(ix: AnyIx): Promise<void> {
  if (ix.isChatInputCommand() || ix.isModalSubmit()) await ix.deferReply({ flags: V2E });
  else await ix.deferUpdate();
}

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

async function sendLoadOpts(interaction: AnyIx, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
    return;
  }
  try {
    await bk.fetch(backupId);
  } catch {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
    return;
  }

  const acts = row(
    btn(`backup:load_warning?backup_load:${backupId}`, "Continue", ButtonStyle.Success),
    btn(`backup:load_cancel?backup_load:${backupId}`, "Cancel", ButtonStyle.Danger),
    lnk(prem, "Join our Discord")
  );

  await respond(interaction, [
    st("Warning", og, "**What do you want Xenon to load from the backup?**\n\nThis is a **completely free version of Xenon** — **threads, members, bans and messages** are all free here!\n\nSelect below what actions you would like Xenon to perform. In the next menu, you will be able to see a detailed list of changes before continuing.", lSel(backupId), acts),
  ]);
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = interaction.options.getFocused().toLowerCase();
  const ids = ownList(interaction.user.id).filter((id) => id.toLowerCase().includes(q)).slice(0, 25);
  await interaction.respond(ids.map((id) => ({ name: id, value: id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

const INT_CHOICES = [
  { name: "4 hours", value: "4h" },
  { name: "8 hours", value: "8h" },
  { name: "12 hours", value: "12h" },
  { name: "24 hours", value: "24h" },
  { name: "2 days", value: "2d" },
  { name: "3 days", value: "3d" },
  { name: "7 days", value: "7d" },
  { name: "14 days", value: "14d" },
  { name: "30 days", value: "30d" },
];

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  // Hub menu
  if (cid === "backup:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    const cfg: Guild = g(guild.id);
    if (action === "create") {
      await hCreate(interaction);
      return;
    }
    if (action === "load") {
      if (!canUseComponent(interaction, true)) {
        await interaction.update({ components: [td("You do not have permission to use this command on this server.")] });
        return;
      }
      await openModal(interaction, "backup:modal:load", "Charger un backup", [
        { id: "backup_id", label: "ID du backup", required: true, placeholder: "ABCDEF123456" },
        { id: "options", label: "Options (optionnel)", required: false, placeholder: "ex: channels roles" },
      ]);
      return;
    }
    if (action === "info") {
      await openModal(interaction, "backup:modal:info", "Infos backup", [
        { id: "backup_id", label: "ID du backup", required: true, placeholder: "ABCDEF123456" },
      ]);
      return;
    }
    if (action === "list") {
      await hList(interaction, 1);
      return;
    }
    if (action === "delete") {
      await openModal(interaction, "backup:modal:delete", "Supprimer un backup", [
        { id: "backup_id", label: "ID du backup", required: true, placeholder: "ABCDEF123456" },
      ]);
      return;
    }
    if (action === "purge") {
      await openModal(interaction, "backup:modal:purge", "Purger les backups", [
        { id: "older_than", label: "Plus vieux que (optionnel)", required: false, placeholder: "24h, 7d, 30d…" },
        { id: "server_name", label: "Nom du serveur (optionnel)", required: false, placeholder: "Mon Serveur" },
      ]);
      return;
    }
    if (action === "interval_show") {
      await hInterval(interaction, "show", cfg);
      return;
    }
    if (action === "interval_on") {
      const sel = new StringSelectMenuBuilder()
        .setCustomId("backup:isel")
        .setPlaceholder("Choisis l'intervalle…")
        .addOptions(INT_CHOICES.map((c) => new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.value)));
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# ⏰ Intervalle auto\nTous les combien créer un backup automatique ?"))
            .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    if (action === "interval_off") {
      await hInterval(interaction, "off", cfg);
      return;
    }
    if (action === "cancel") {
      const p = proc.get(guild.id);
      if (!p) {
        await interaction.update({ components: [st("Error", rd, "There is **no loading process running** on this server.")] });
      } else {
        p.cancelled = true;
        await interaction.update({ components: [st("Info", bl, "The loading process has been **cancelled**.")] });
      }
      return;
    }
    if (action === "status") {
      const p = proc.get(guild.id);
      if (!p) {
        await interaction.update({ components: [st("Info", bl, "Aucun chargement en cours sur ce serveur.")] });
      } else {
        await interaction.update({ components: [st("Info", bl, `Chargement en cours (démarré <t:${Math.floor(p.startedAt / 1000)}:R>).`)] });
      }
      return;
    }
    if (action === "faq") {
      await hFaq(interaction);
      return;
    }
    return;
  }

  // Interval select
  if (cid === "backup:isel" && interaction.isStringSelectMenu()) {
    const cfg: Guild = g(guild.id);
    await hIntervalOn(interaction, interaction.values[0]!, cfg);
    return;
  }

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
    await interaction.update({ components: [st("Success", gr, "Successfully **deleted backup.")] });
    return;
  }
  if (action === "backup:delete_direct_cancel") {
    await interaction.update({ components: [st("Info", bl, "The backup has not been deleted.")] });
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
    await interaction.update({ components: [st("Info", bl, "The loading process has been **cancelled**.")] });
    return;
  }

  if (action === "backup:delete_confirm") {
    if (!isOwner) {
      await interaction.reply({ components: [st("Error", rd, `No backup found for \`${session}\`!`)], flags: V2E });
      return;
    }
    await bk.remove(session).catch(() => {});
    ownDel(interaction.user.id, session);
    await interaction.update({ components: [st("Success", gr, "Successfully **deleted backup.")] });
    return;
  }
  if (action === "backup:delete_cancel") {
    await interaction.update({ components: [st("Info", bl, "The backup has not been deleted.")] });
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

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const cid = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  if (cid === "backup:modal:load") {
    if (!canUseComponent(interaction, true)) {
      await interaction.reply({ components: [td("You do not have permission to use this command on this server.")], flags: V2E });
      return;
    }
    const backupId = interaction.fields.getTextInputValue("backup_id").trim();
    await sendLoadOpts(interaction, backupId);
    return;
  }
  if (cid === "backup:modal:info") {
    const backupId = interaction.fields.getTextInputValue("backup_id").trim();
    await hInfo(interaction, backupId);
    return;
  }
  if (cid === "backup:modal:delete") {
    const backupId = interaction.fields.getTextInputValue("backup_id").trim();
    await hDelete(interaction, backupId);
    return;
  }
  if (cid === "backup:modal:purge") {
    const olderThan = interaction.fields.getTextInputValue("older_than").trim() || null;
    const serverName = interaction.fields.getTextInputValue("server_name").trim() || null;
    await hPurge(interaction, olderThan, serverName);
    return;
  }
}

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Comment créer un backup ?",
    a: "Ouvre le menu /backup et choisis « Créer un backup ». La sauvegarde inclut salons, rôles, bans, emojis et réglages.",
  },
  {
    q: "Comment restaurer un backup ?",
    a: "Choisis « Charger un backup » dans le menu, puis colle l'ID du backup. Tu peux choisir quoi restaurer (salons, rôles, messages…).",
  },
  {
    q: "Les backups sont-ils gratuits ?",
    a: "Oui, tout est gratuit : backups, messages, salons vocaux, synchronisations, modèles et exports.",
  },
  {
    q: "Puis-je automatiser les backups ?",
    a: "Oui : « Activer l'intervalle » dans le menu /backup crée des sauvegardes automatiques régulières.",
  },
  {
    q: "J'ai une erreur, que faire ?",
    a: "Lis attentivement le message d'erreur. Si un chargement est bloqué, utilise « Annuler » puis réessaie.",
  },
];

/** Affiche la FAQ (anciennement /backup-faq, désormais intégrée au hub). */
async function hFaq(interaction: MessageComponentInteraction): Promise<void> {
  const blocks = [
    tx("# ❓ Questions fréquentes"),
    ...FAQ_ITEMS.flatMap((f) => [tx(`**${f.q}**\n${f.a}`), tx("​")]),
  ];
  await interaction.update({ components: [panel(blocks)] });
}

async function hCreate(interaction: AnyIx): Promise<void> {
  const guild = interaction.guild!;
  await deferAny(interaction);
  const edit = async (comps: any[]) => {
    await interaction.editReply({ components: comps });
  };
  await edit([st("Creating backup ...", bl, "Saving **channels, roles, members, bans, threads, and messages**...")]).catch(() => {});

  let data;
  try {
    const id = await uid();
    data = await bk.create(guild, {
      backupID: id,
      maxMessagesPerChannel: DEF_MSGS,
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
    await edit([st("Error", rd, "An error occurred while creating the backup.")]);
    return;
  }

  await edit([
    st("Success", gr, `Successfully **created backup** with the id \`${data.id}\`.\n\n` +
      "This backup contains server settings, channels, roles, **members, bans, threads and messages**."),
  ]);
}

async function hInfo(interaction: AnyIx, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
    return;
  }
  let infos: BackupInfos;
  try {
    infos = await bk.fetch(backupId);
  } catch {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
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

  await respond(interaction, [panelWith(blocks, acts)]);
}

async function hList(interaction: AnyIx, page: number): Promise<void> {
  const ids = ownList(interaction.user.id);
  if (ids.length === 0) {
    await respond(interaction, [st("Error", rd, "There are **no backups** yet.")]);
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

  await respond(interaction, [panelWith(blocks, selRow, nav)]);
}

async function hDelete(interaction: AnyIx, backupId: string): Promise<void> {
  if (!ownList(interaction.user.id).includes(backupId)) {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
    return;
  }
  try {
    await bk.fetch(backupId);
  } catch {
    await respond(interaction, [st("Error", rd, `No backup found for \`${backupId}\`!`)]);
    return;
  }
  const comps = [
    st("Warning", og, "Are you sure that you want to delete this backup? **This can not be undone**.", row(btn(`backup:delete_confirm?${backupId}`, "Confirm", ButtonStyle.Success), btn("backup:delete_cancel", "Cancel", ButtonStyle.Danger))),
  ];
  // Depuis un modal, reply direct ; sinon update si composant
  if (interaction.isModalSubmit()) await interaction.reply({ components: comps, flags: V2E });
  else if (interaction.isChatInputCommand()) await interaction.reply({ components: comps, flags: V2E });
  else await interaction.update({ components: comps });
}

async function hPurge(interaction: AnyIx, olderThan: string | null, serverName: string | null): Promise<void> {
  const uid2 = interaction.user.id;
  const ids = ownList(uid2);

  let target = ids;
  if (olderThan) {
    const mult: Record<string, number> = { h: 3600000, d: 86400000 };
    const m = /^(\d+)([hd])$/.exec(olderThan);
    if (!m) {
      await respond(interaction, [st("Error", rd, "Invalid format. Use e.g. `24h`, `7d`.")]);
      return;
    }
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
    await respond(interaction, [st("Error", rd, "There are **no backups** to delete.")]);
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

  const comps = [
    st("Warning", og, `Are you sure that you want to delete **${target.length}** backup(s)? **This can not be undone.**\n\n${preview}${more}`,
      row(btn("backup:purge_confirm", "Confirm", ButtonStyle.Success), btn("backup:purge_cancel", "Cancel", ButtonStyle.Danger))),
  ];
  if (interaction.isModalSubmit() || interaction.isChatInputCommand()) await interaction.reply({ components: comps, flags: V2E });
  else await interaction.update({ components: comps });
  pendPurge.set(interaction.user.id, target);
}

const INT_MIN: Record<string, number> = { "4h": 4 * 3600000, "8h": 8 * 3600000, "12h": 12 * 3600000, "24h": 24 * 3600000 };

async function hInterval(interaction: AnyIx, sub: string, cfg: Guild): Promise<void> {
  if (sub === "show") {
    if (!cfg.backup_interval_ms) {
      await respond(interaction, [st("Error", rd, "Your backup interval is not enabled for this server.")]);
      return;
    }
    const next = cfg.backup_interval_last ? Math.floor((cfg.backup_interval_last + cfg.backup_interval_ms) / 1000) : Math.floor((Date.now() + cfg.backup_interval_ms) / 1000);
    await respond(interaction, [st("Info", bl, `Your backup interval is enabled (every \`${fmt(cfg.backup_interval_ms)}\`). Next backup <t:${next}:R>.`)]);
    return;
  }

  if (sub === "off") {
    intOff(cfg);
    aud(interaction.guild!.id, interaction.user.id, ACT.BACKUP_INTERVAL_DISABLE, `<@${interaction.user.id}> disabled the backup interval on this server`);
    await respond(interaction, [st("Success", gr, "Successfully **disabled your backup interval** for this server.")]);
    return;
  }
}

async function hIntervalOn(interaction: MessageComponentInteraction, interval: string, cfg: Guild): Promise<void> {
  const actual = intMs(interval);
  if (!actual) {
    await interaction.update({ components: [st("Error", rd, "Invalid interval.")] });
    return;
  }
  intOn(cfg, actual);
  aud(interaction.guild!.id, interaction.user.id, ACT.BACKUP_INTERVAL_ENABLE, `<@${interaction.user.id}> enabled the backup interval on this server`);
  const next = Math.floor((Date.now() + actual) / 1000);
  await interaction.update({ components: [st("Success", gr, `Successful **enabled the backup interval**.\nThe first backup will be created in <t:${next}:R>.`)] });
}

function fmt(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d) return `${d} day${d > 1 ? "s" : ""}`;
  return `${h} hour${h > 1 ? "s" : ""}`;
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
