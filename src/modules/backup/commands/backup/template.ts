import { SlashCommandBuilder, ChannelType, ButtonStyle, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { aud, ACT } from "../../func/db.ts";
import { st, td, panel, panelWith, tx, row, btn, lnk, V2E, type Blk } from "../../func/ui.ts";
import { canUse } from "../../func/permCheck.ts";

export const data = new SlashCommandBuilder()
  .setName("template")
  .setDescription("Choose from thousands of free server templates")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) => s.setName("create").setDescription("Create a new public template"))
  .addSubcommand((s) =>
    s
      .setName("load")
      .setDescription("Load one of the public templates")
      .addStringOption((o) => o.setName("name_or_id").setDescription("The name, id or url of the template that you want to load").setRequired(true))
      .addStringOption((o) => o.setName("options").setDescription("A list of options").setRequired(false))
  )
  .addSubcommand((s) => s.setName("cancel").setDescription("Cancel the currently running loading process on this server"))
  .addSubcommand((s) => s.setName("status").setDescription("Get the status of the currently running loading process"))
  .addSubcommand((s) => s.setName("list").setDescription("Get a list of available public templates"))
  .addSubcommand((s) =>
    s
      .setName("info")
      .setDescription("Get information about a public template")
      .addStringOption((o) => o.setName("name_or_id").setDescription("The name, id or url of the template that you want to load").setRequired(true))
  );

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const TPL = "https://xenon.bot/templates";
const LIST_URL = "https://templates.xenon.bot/templates";
const API = "https://discord.com/api/v10";

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

// grab the structure from the xenon preview page and convert it to a discord template payload
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;

  if (sub === "create") {
    await interaction.reply({
      components: [td(`Please use [xenon.bot/templates](${TPL}) to add new templates, you can find help on the [wiki](https://wiki.xenon.bot/en/templates#creating-a-template) for how to create new templates.`)],
      flags: V2E,
    });
    return;
  }

  if (sub === "cancel" || sub === "status") {
    await interaction.reply({ components: [st("Error", rd, "There is **no loading process running** on this server.")], flags: V2E });
    return;
  }

  if (sub === "list") {
    await interaction.deferReply({ flags: V2E });
    const list = (await fetchList()).sort((a, b) => b.usage_count - a.usage_count).slice(0, 15);
    if (list.length === 0) {
      await interaction.editReply({ components: [st("Error", rd, "Could not load templates. Try again later.")], flags: V2E });
      return;
    }
    const blocks: Blk[] = [
      tx("**Popular Templates**"),
      tx(`Go to [xenon.bot/templates](${TPL}) to see all templates.`),
      tx("\u200b"),
      ...list.map((t) => tx(`**${t.name}** - \`${t.id}\` (${t.usage_count} uses)`)),
    ];
    await interaction.editReply({ components: [panel(blocks)], flags: V2E });
    return;
  }

  const nameOrId = interaction.options.getString("name_or_id")!;

  if (sub === "info") {
    await interaction.deferReply({ flags: V2E });
    const meta = await resolve(nameOrId);
    if (!meta) {
      await interaction.editReply({
        components: [st("Error", rd, `Can't find a template with the name, id or url \`${nameOrId}\`.\nGo to [xenon.bot/templates](${TPL}) to get a list of available templates.`)],
        flags: V2E,
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
    await interaction.editReply({ components: [panelWith(blocks, acts)], flags: V2E });
    return;
  }

  if (sub === "load") {
    if (!canUse(interaction, true)) {
      await interaction.reply({ components: [td("You do not have permission to use this command on this server.")], flags: V2E });
      return;
    }
    const enabled = parseOpts(interaction.options.getString("options"));
    await interaction.reply({ components: [st("Creating backup ...", bl, `Loading template \`${nameOrId}\`...`)], flags: V2E });

    const meta = await resolve(nameOrId);
    if (!meta) {
      await interaction.editReply({ components: [st("Error", rd, `Can't find a template with the name, id or url \`${nameOrId}\`.`)], flags: V2E });
      return;
    }

    const r = await doLoad(guild, interaction.user.id, meta.id, enabled);
    await interaction.editReply({ components: [st(r.ok ? "Success" : "Error", r.ok ? gr : rd, r.msg)], flags: V2E });
  }
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const [action, payload = ""] = interaction.customId.split("?");
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
