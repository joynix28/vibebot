import { SlashCommandBuilder, ChannelType, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { aud, ACT } from "../../func/db.ts";
import { st, td, panel, panelWith, tx, row, btn, lnk, V2E, type Blk } from "../../func/ui.ts";
import { permLvl } from "../../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("template")
  .setDescription("Choisir parmi des modèles de serveur gratuits")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const TPL = "https://xenon.bot/templates";
const LIST_URL = "https://templates.xenon.bot/templates";
const API = "https://discord.com/api/v10";

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("template:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Charger un modèle").setValue("load").setDescription("Charge un modèle public sur ce serveur").setEmoji("📥"),
      new StringSelectMenuOptionBuilder().setLabel("Créer un modèle").setValue("create").setDescription("Publier un nouveau modèle").setEmoji("➕"),
      new StringSelectMenuOptionBuilder().setLabel("Liste des modèles").setValue("list").setDescription("Voir les modèles populaires").setEmoji("📝"),
      new StringSelectMenuOptionBuilder().setLabel("Infos modèle").setValue("info").setDescription("Détails d'un modèle public").setEmoji("ℹ️"),
      new StringSelectMenuOptionBuilder().setLabel("Statut").setValue("status").setDescription("État du chargement en cours").setEmoji("⏳"),
      new StringSelectMenuOptionBuilder().setLabel("Annuler").setValue("cancel").setDescription("Annule le chargement en cours").setEmoji("🚫")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 🧩 Modèles de serveur\nChoisis une action dans le menu ci-dessous.")
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

function jfetch(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(8000) });
}

let tplCache: any[] | null = null;
let cacheAt = 0;

interface TplMeta {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  usage_count: number;
  language: string | null;
}

async function fetchList(): Promise<TplMeta[]> {
  if (tplCache && Date.now() - cacheAt < 3600000) return tplCache;
  try {
    const res = await jfetch(LIST_URL);
    const html = await res.text();
    const m = /__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
    if (!m) return [];
    const data = JSON.parse(m[1]!);
    const lists: Record<string, TplMeta[]> = data?.props?.pageProps?.data ?? {};
    const seen = new Map<string, TplMeta>();
    for (const arr of Object.values(lists)) {
      if (!Array.isArray(arr)) continue;
      for (const t of arr) {
        if (t?.id && !seen.has(t.id)) seen.set(t.id, t as TplMeta);
      }
    }
    tplCache = [...seen.values()];
    cacheAt = Date.now();
    return tplCache;
  } catch {
    return [];
  }
}

async function candidates(query: string): Promise<TplMeta[]> {
  let q = query.trim();
  if (q.includes("discord.new/") || q.includes("discord.com/")) {
    q = q.split("/").pop() ?? "";
    q = q.split("?")[0] ?? q;
  }
  const direct = await fetchAnyTpl(q);
  if (direct) return [{ id: q, name: direct.name, description: direct.description, tags: [], usage_count: 0, language: null }];
  const list = await fetchList();
  const byId = list.find((t) => t.id.toLowerCase() === q.toLowerCase());
  const byName = list.filter((t) => t.name.toLowerCase() === q.toLowerCase());
  const byPart = list.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  const seen = new Set<string>();
  const out: TplMeta[] = [];
  for (const t of [byId, ...byName, ...byPart]) {
    if (t && !seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}

async function resolve(query: string): Promise<TplMeta | null> {
  const cands = await candidates(query);
  if (cands.length === 0) return null;
  for (const c of cands) {
    if (await fetchAnyTpl(c.id)) return c;
  }
  return cands[0]!;
}

async function fetchDiscordTpl(code: string): Promise<any | null> {
  if (!/^[A-Za-z0-9]{5,20}$/.test(code)) return null;
  try {
    const res = await jfetch(`${API}/guilds/templates/${code}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPreviewTpl(code: string): Promise<any | null> {
  if (!/^[A-Za-z0-9]{5,20}$/.test(code)) return null;
  try {
    const res = await jfetch(`https://xenon.bot/templates/${code}/preview`);
    if (!res.ok) return null;
    const html = await res.text();
    const m = /__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s.exec(html);
    if (!m) return null;
    const data = JSON.parse(m[1]!);
    const src = data?.props?.pageProps?.data;
    if (!src || !Array.isArray(src.channels) || !Array.isArray(src.roles)) return null;
    return {
      name: String(src.name ?? code),
      code,
      serialized_source_guild: {
        name: String(src.name ?? code),
        icon: null,
        roles: src.roles.map((r: any) => ({
          id: String(r.id),
          name: String(r.name),
          permissions: String(r.permissions ?? 0),
          color: Number(r.color ?? 0),
          hoist: !!r.hoist,
          mentionable: !!r.mentionable,
        })),
        channels: src.channels.map((c: any) => ({
          id: String(c.id),
          type: Number(c.type),
          name: String(c.name),
          position: Number(c.position ?? 0),
          topic: c.topic ?? "",
          bitrate: Number(c.bitrate ?? 64000),
          user_limit: Number(c.user_limit ?? 0),
          nsfw: !!c.nsfw,
          rate_limit_per_user: Number(c.rate_limit_per_user ?? 0),
          parent_id: c.parent_id ? String(c.parent_id) : undefined,
          permission_overwrites: (c.permission_overwrites ?? []).map((o: any) => ({
            id: String(o.id),
            type: Number(o.type),
            allow: String(o.allow ?? 0),
            deny: String(o.deny ?? 0),
          })),
        })),
      },
    };
  } catch {
    return null;
  }
}

async function fetchAnyTpl(code: string): Promise<any | null> {
  const d = await fetchDiscordTpl(code);
  if (d) return d;
  return fetchPreviewTpl(code);
}

async function applyTpl(guild: any, tpl: any, enabled: Set<string>): Promise<void> {
  if (enabled.has("settings") && tpl.serialized_source_guild?.name) {
    await guild.setName(String(tpl.serialized_source_guild.name)).catch(() => {});
  }

  if (enabled.has("delete-channels")) {
    const channels = [...guild.channels.cache.values()];
    await Promise.allSettled(channels.map((c) => guild.channels.delete(c.id)));
  }

  if (enabled.has("delete-roles")) {
    const roles = [...guild.roles.cache.values()].filter((r: any) => r.id !== guild.id && !r.managed);
    await Promise.allSettled(roles.map((r) => guild.roles.delete(r.id)));
  }

  const newRoles = new Map<string, string>();

  if (enabled.has("roles") && Array.isArray(tpl.serialized_source_guild?.roles)) {
    const roles = tpl.serialized_source_guild.roles.filter((r: any) => r.name !== "@everyone");
    await Promise.allSettled(
      roles.map(async (r: any) => {
        try {
          const created = await guild.roles.create({ name: String(r.name), colors: { primaryColor: r.color ?? 0 }, hoist: r.hoist ?? false, permissions: r.permissions ?? [] });
          if (r.id) newRoles.set(String(r.id), created.id);
        } catch {}
      })
    );
  }

  if (enabled.has("channels") && Array.isArray(tpl.serialized_source_guild?.channels)) {
    const cats = tpl.serialized_source_guild.channels.filter((c: any) => c.type === ChannelType.GuildCategory);
    const others = tpl.serialized_source_guild.channels.filter((c: any) => c.type !== ChannelType.GuildCategory);

    const catIds = new Map<string, string>();
    await Promise.allSettled(
      cats.map(async (c: any) => {
        try {
          const created = await guild.channels.create({ name: String(c.name), type: ChannelType.GuildCategory });
          if (c.id) catIds.set(String(c.id), created.id);
        } catch {}
      })
    );

    await Promise.allSettled(
      others.map(async (c: any) => {
        try {
          const parent = c.parent_id ? catIds.get(String(c.parent_id)) : undefined;
          const overwrites = Array.isArray(c.permission_overwrites)
            ? c.permission_overwrites.map((o: any) => ({
                id: o.id === String(guild.id) ? guild.id : (newRoles.get(String(o.id)) ?? o.id),
                type: o.type,
                allow: o.allow,
                deny: o.deny,
              }))
            : undefined;
          if (c.type === ChannelType.GuildVoice) {
            await guild.channels.create({ name: String(c.name), type: ChannelType.GuildVoice, parent, permissionOverwrites: overwrites });
          } else {
            await guild.channels.create({ name: String(c.name), type: ChannelType.GuildText, parent, permissionOverwrites: overwrites });
          }
        } catch {}
      })
    );
  }
}

function parseOpts(options: string | null): Set<string> {
  const enabled = new Set(["delete-channels", "channels", "delete-roles", "roles", "settings"]);
  if (!options) return enabled;
  enabled.clear();
  const parts = options.split(/\s+/);
  if (parts.includes("*")) {
    ["settings", "members", "channels", "delete-channels", "roles", "delete-roles", "bans", "invite", "pins"].forEach((k) => enabled.add(k));
  } else {
    for (const p of parts) {
      if (p.startsWith("!")) {
        if (p === "!*") enabled.clear();
        else enabled.delete(p.slice(1));
      } else {
        enabled.add(p);
      }
    }
  }
  return enabled;
}

async function doLoad(guild: any, userId: string, code: string, enabled: Set<string>): Promise<{ ok: boolean; msg: string }> {
  const tpl = await fetchAnyTpl(code);
  if (!tpl) return { ok: false, msg: `Can't load template \`${code}\`. It may be expired.` };
  try {
    await applyTpl(guild, tpl, enabled);
    aud(guild.id, userId, ACT.TEMPLATE_LOAD, `<@${userId}> loaded a template on this server`);
    return { ok: true, msg: `Successfully **loaded template** \`${tpl.name}\`.\n\n**Loaded:** ${[...enabled].join(", ")}` };
  } catch (err) {
    console.error("[template] load failed", err);
    return { ok: false, msg: "An error occurred while loading the template." };
  }
}

async function replyUpdate(interaction: MessageComponentInteraction, comps: any[]): Promise<void> {
  if (interaction.deferred || interaction.replied) await interaction.editReply({ components: comps });
  else await interaction.update({ components: comps });
}

async function doCreate(interaction: MessageComponentInteraction): Promise<void> {
  await replyUpdate(interaction, [
    td(`Please use [xenon.bot/templates](${TPL}) to add new templates, you can find help on the [wiki](https://wiki.xenon.bot/en/templates#creating-a-template) for how to create new templates.`),
  ]);
}

async function doCancelStatus(interaction: MessageComponentInteraction): Promise<void> {
  await replyUpdate(interaction, [st("Error", rd, "There is **no loading process running** on this server.")]);
}

async function doList(interaction: MessageComponentInteraction): Promise<void> {
  await interaction.deferUpdate();
  const list = (await fetchList()).sort((a, b) => b.usage_count - a.usage_count).slice(0, 15);
  if (list.length === 0) {
    await interaction.editReply({ components: [st("Error", rd, "Could not load templates. Try again later.")] });
    return;
  }
  const blocks: Blk[] = [
    tx("**Popular Templates**"),
    tx(`Go to [xenon.bot/templates](${TPL}) to see all templates.`),
    tx("\u200b"),
    ...list.map((t) => tx(`**${t.name}** - \`${t.id}\` (${t.usage_count} uses)`)),
  ];
  await interaction.editReply({ components: [panel(blocks)] });
}

async function doInfo(interaction: ModalSubmitInteraction, nameOrId: string): Promise<void> {
  await interaction.deferReply({ flags: V2E } as any);
  const meta = await resolve(nameOrId);
  if (!meta) {
    await interaction.editReply({
      components: [st("Error", rd, `Can't find a template with the name, id or url \`${nameOrId}\`.\nGo to [xenon.bot/templates](${TPL}) to get a list of available templates.`)],
    });
    return;
  }
  const tpl = await fetchAnyTpl(meta.id);
  const s = tpl?.serialized_source_guild ?? {};
  const blocks: Blk[] = [
    tx("**Template Info**"),
    tx(`**Name:** ${meta.name}`),
    tx(`**Code:** \`${meta.id}\``),
    tx(`**Description:** ${meta.description || "none"}`),
    tx(`**Used:** ${meta.usage_count || tpl?.usage_count || 0} times`),
    tx(`**Channels:** \`${s.channels?.length ?? 0}\` | **Roles:** \`${s.roles?.length ?? 0}\``),
    tx(`**Link:** https://discord.new/${meta.id}`),
  ];
  const acts = row(
    btn(`template:load_direct?${meta.id}`, "Load this template", ButtonStyle.Primary),
    lnk(`https://discord.new/${meta.id}`, "discord.new", "🔗")
  );
  await interaction.editReply({ components: [panelWith(blocks, acts)] });
}

async function doLoadModal(interaction: ModalSubmitInteraction, nameOrId: string, options: string | null): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!canUseComponent(interaction, true)) {
    await interaction.reply({ components: [td("You do not have permission to use this command on this server.")], flags: V2E });
    return;
  }
  const enabled = parseOpts(options);
  await interaction.reply({ components: [st("Creating backup ...", bl, `Loading template \`${nameOrId}\`...`)], flags: V2E });

  const meta = await resolve(nameOrId);
  if (!meta) {
    await interaction.editReply({ components: [st("Error", rd, `Can't find a template with the name, id or url \`${nameOrId}\`.`)], flags: V2E });
    return;
  }

  const r = await doLoad(guild, interaction.user.id, meta.id, enabled);
  await interaction.editReply({ components: [st(r.ok ? "Success" : "Error", r.ok ? gr : rd, r.msg)], flags: V2E });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  // Hub menu
  if (cid === "template:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "create") {
      await doCreate(interaction);
      return;
    }
    if (action === "cancel" || action === "status") {
      await doCancelStatus(interaction);
      return;
    }
    if (action === "list") {
      await doList(interaction);
      return;
    }
    if (action === "load") {
      await openModal(interaction, "template:modal:load", "Charger un modèle", [
        { id: "name_or_id", label: "Nom, ID ou lien du modèle", required: true, placeholder: "mon-modele" },
        { id: "options", label: "Options (optionnel)", required: false, placeholder: "ex: channels roles" },
      ]);
      return;
    }
    if (action === "info") {
      await openModal(interaction, "template:modal:info", "Infos modèle", [
        { id: "name_or_id", label: "Nom, ID ou lien du modèle", required: true, placeholder: "mon-modele" },
      ]);
      return;
    }
    return;
  }

  const [action, payload = ""] = cid.split("?");
  const guild = interaction.guild;
  if (!guild) return;

  if (action === "template:load_direct") {
    const code = payload;
    if (!/^[A-Za-z0-9]{5,20}$/.test(code)) {
      await interaction.reply({ components: [st("Error", rd, "Invalid template code.")], flags: V2E });
      return;
    }
    await interaction.update({
      components: [st("Warning", og, `Are you sure that you want to load the template \`${code}\` on this server? This will create channels and roles. **This cannot be undone.**`, row(btn(`template:load_confirm?${code}`, "Confirm", ButtonStyle.Success), btn(`template:load_cancel?${code}`, "Cancel", ButtonStyle.Danger)))],
    });
    return;
  }

  if (action === "template:load_confirm") {
    const code = payload;
    await interaction.update({ components: [st("Creating backup ...", bl, `Loading template \`${code}\`...`)] });
    const r = await doLoad(guild, interaction.user.id, code, parseOpts(null));
    await interaction.editReply({ components: [st(r.ok ? "Success" : "Error", r.ok ? gr : rd, r.msg)], flags: V2E }).catch(() => {});
    return;
  }

  if (action === "template:load_cancel") {
    await interaction.update({ components: [st("Info", bl, "Template loading cancelled.")] });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const cid = interaction.customId;
  if (cid === "template:modal:load") {
    const nameOrId = interaction.fields.getTextInputValue("name_or_id").trim();
    const options = interaction.fields.getTextInputValue("options").trim() || null;
    await doLoadModal(interaction, nameOrId, options);
    return;
  }
  if (cid === "template:modal:info") {
    const nameOrId = interaction.fields.getTextInputValue("name_or_id").trim();
    await doInfo(interaction, nameOrId);
    return;
  }
}
