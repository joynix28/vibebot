import { SlashCommandBuilder, PermissionFlagsBits, Routes } from "discord.js"
import type { ChatInputCommandInteraction, ModalSubmitInteraction, MessageComponentInteraction, Guild, StringSelectMenuInteraction } from "discord.js"
import { ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js"
import { panel, tb, sep, row, lnk, sel, frog, green, red, flags_ephemeral } from "../../func/ui.ts"
import { FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts"
import { meta } from "../../func/emoji.ts"
import {
  ensure,
  parseTactics,
  recent,
  tot,
  gTop,
  grand,
  today,
  servers,
  rank,
  topUsers,
  setLogChannel,
  setAction,
  setTactics,
  setMessage,
  resetMessages,
  action_text,
  setScore,
  messages,
  type FrogAction,
} from "../../func/db.ts"
import { retarget, renameTrap } from "../../func/setup.ts"
import { fmt, tmsg } from "../../func/trap.ts"

export const data = new SlashCommandBuilder()
  .setName("frog")
  .setDescription("🐸 Panneau de configuration Frog")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

const label: Record<FrogAction, string> = { softban: "Kick", ban: "Ban", disabled: "Disabled" }
const tacticNames: Record<string, string> = {
  no_warning: "No Warning Msg",
  no_dm: "No DM",
  dm_rejoin: "DM Rejoin Link",
  new_account_only: "New Accounts Only",
  random_name: "Random Channel Name",
  random_name_chaos: "Random Name (Chaos)",
}
const tacticsList = Object.keys(tacticNames)

type FrogInteraction = ChatInputCommandInteraction | MessageComponentInteraction

const HUB_ACTIONS = [
  { value: "config", label: "Configuration", emoji: "⚙️", description: "Salon piège, salon de logs, action et tactiques" },
  { value: "customize", label: "Messages", emoji: "✏️", description: "Personnalise les messages d'avertissement, DM et logs" },
  { value: "status", label: "Statut", emoji: "📊", description: "Affiche la configuration actuelle du serveur" },
  { value: "history", label: "Historique", emoji: "📜", description: "Les 10 derniers utilisateurs piégés" },
  { value: "score", label: "Score sécurité", emoji: "🛡️", description: "Évalue ta configuration Frog" },
  { value: "vote", label: "Voter", emoji: "🗳️", description: "Vote pour Frog sur top.gg" },
  { value: "top", label: "Classement grenouilles", emoji: "🐸", description: "Classements des captures Frog" },
  { value: "support", label: "Support", emoji: "💬", description: "Rejoins le serveur de support Frog" },
]

function hubMessage(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(frog)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${meta("froge").tag} Frog\nChoisis une action ci-dessous 👇`)
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("frog:menu")
          .setPlaceholder("Choisis une action…")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            HUB_ACTIONS.map((a) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(a.label)
                .setValue(a.value)
                .setDescription(a.description)
                .setEmoji(a.emoji)
            )
          )
      )
    )
}

export async function execute(i: ChatInputCommandInteraction) {
  await i.reply({ components: [hubMessage()], flags: FLAGS_V2_EPHEMERAL })
}

export async function handleComponent(i: MessageComponentInteraction) {
  // Sous-sélecteur des classements (customId préfixé frog: pour le routeur).
  if (i.customId.startsWith("frog:topselect:")) {
    const uid = i.customId.split(":")[2]
    if (uid && uid !== i.user.id) return
    if (i.isStringSelectMenu()) return sendTop(i, i.values[0] ?? "this_server")
    return
  }
  if (!i.isStringSelectMenu() || i.customId !== "frog:menu") return
  const guild = i.guild
  if (!guild) {
    await i.reply({ components: [panel([tb("Cette action doit être utilisée sur un serveur.")], red)], flags: flags_ephemeral }).catch(() => {})
    return
  }
  const action = i.values[0]
  if (action === "config") return openConfig(i)
  if (action === "customize") return openMessages(i)
  if (action === "status") return showStatus(i, guild)
  if (action === "history") return showHistory(i, guild)
  if (action === "score") return score(i, guild)
  if (action === "vote") return showVote(i)
  if (action === "top") return sendTop(i, "this_server")
  if (action === "support") return showSupport(i)
}

async function showStatus(i: FrogInteraction, guild: Guild) {
  await i.reply({ components: [panel([summary(guild)], frog)], flags: flags_ephemeral })
}

async function showHistory(i: FrogInteraction, guild: Guild) {
  const rows = recent(guild.id, 10)
  const lines = rows.map((c, k) => `${k + 1}. <@${c.user_id}> — ${action_text[c.action]} — <t:${Math.floor(c.created_at / 1000)}:R>`)
  await i.reply({ components: [panel([tb(`## ${meta("gotcha").tag} Recent Catches\n` + (lines.length ? lines.join("\n") : "*No catches yet.*"))], frog)], flags: flags_ephemeral })
}

// ---------------------------------------------------------------------------
// Vote / Support / Classements — ex-commandes /vote, /frog-support, /frog-top
// absorbées dans le hub (customIds préfixés frog: pour le routeur).
// ---------------------------------------------------------------------------

async function showVote(i: FrogInteraction) {
  const body = panel(
    [
      tb(
        `## ${meta("frogwow").tag} Vote pour Frog\n` +
          "Voter aide Frog à atteindre plus de serveurs et à piéger plus de spammeurs. Ça prend deux secondes !"
      ),
      row(lnk("https://top.gg/bot/1438562278172790925/vote", "Voter sur top.gg", meta("frogwow").raw)),
    ],
    frog
  )
  await i.reply({ components: [body], flags: flags_ephemeral })
}

async function showSupport(i: FrogInteraction) {
  const body = panel(
    [
      tb(
        `## ${meta("froghuh").tag} Serveur de support\n` +
          "Besoin d'aide pour configurer Frog, un bug à signaler ou une suggestion ? Rejoins le serveur de support."
      ),
      row(lnk("https://discord.gg/jz4DXKvu2E", "Rejoindre le serveur de support", meta("froghuh").raw)),
    ],
    frog
  )
  await i.reply({ components: [body], flags: flags_ephemeral })
}

const medals = ["🥇", "🥈", "🥉"]
const fmtN = (n: number) => n.toLocaleString("fr-FR")
const pluralFr = (n: number, w: string) => `${fmtN(n)} ${w}${n === 1 ? "" : "s"}`

async function topDisplayName(id: string, i: MessageComponentInteraction): Promise<string> {
  try {
    const u = i.client.users.cache.get(id) ?? (await i.client.users.fetch(id))
    return u.username
  } catch {
    return id
  }
}

async function topServerName(id: string, i: MessageComponentInteraction): Promise<string> {
  return i.client.guilds.cache.get(id)?.name ?? id
}

const TOP_OPTIONS = [
  { label: "Ce serveur", value: "this_server", description: "Top captures sur ce serveur", emoji: "🏠" },
  { label: "Top serveurs", value: "top_servers", description: "Serveurs avec le plus de captures", emoji: "🏆" },
  { label: "Top piégés", value: "top_users", description: "Utilisateurs les plus piégés, tous serveurs", emoji: "🪰" },
  { label: "Vue d'ensemble", value: "global_overview", description: "Statistiques Frog sur tous les serveurs", emoji: "🌍" },
]

async function buildTop(i: MessageComponentInteraction, category: string): Promise<string> {
  const guild = i.guild
  if (category === "top_servers") {
    const list = servers().slice(0, 10)
    const lines: string[] = []
    for (let k = 0; k < list.length; k++) {
      const name = await topServerName(list[k]!.guild_id, i)
      const medal = medals[k] ?? `\`${k + 1}.\``
      lines.push(`${medal} **${name}** — ${pluralFr(list[k]!.n, "capture")}`)
    }
    return `## 🏆 Top serveurs\n-# Classés par nombre total de captures\n\n${lines.join("\n")}`
  }
  if (category === "top_users") {
    const list = topUsers(10)
    const lines: string[] = []
    for (let k = 0; k < list.length; k++) {
      const name = await topDisplayName(list[k]!.user_id, i)
      const medal = medals[k] ?? `\`${k + 1}.\``
      lines.push(`${medal} **${name}** — ${pluralFr(list[k]!.n, "capture")}`)
    }
    return `## 🪰 Top piégés (global)\n-# Utilisateurs les plus souvent piégés sur tous les serveurs\n\n${lines.join("\n")}`
  }
  if (category === "global_overview") {
    const protectedServers = (await i.client.guilds.fetch()).size
    return (
      `## 🌍 Vue d'ensemble\n-# Statistiques du bot sur tous les serveurs protégés\n\n` +
      `**Serveurs protégés** › ${fmtN(protectedServers)}\n` +
      `**Captures totales** › ${fmtN(grand())}\n` +
      `**Captures aujourd'hui** › ${fmtN(today())}`
    )
  }
  const guildName = guild?.name ?? "ce serveur"
  const top = guild ? gTop(guild.id, 10) : []
  const total = guild ? tot(guild.id) : 0
  const lines: string[] = []
  for (let k = 0; k < top.length; k++) {
    const name = await topDisplayName(top[k]!.user_id, i)
    const medal = medals[k] ?? `\`${k + 1}.\``
    lines.push(`${medal} **${name}** — ${pluralFr(top[k]!.n, "capture")}`)
  }
  const pos = guild ? rank(guild.id) : 0
  const serverCount = servers().length
  return (
    `## 🏠 Ce serveur\n-# Top captures sur **${guildName}**\n\n` +
    (lines.join("\n") || "*Aucune capture pour l'instant*") +
    `\n\n-# Captures totales : ${fmtN(total)} · Classement global : ${pos ? `#${fmtN(pos)} sur ${fmtN(serverCount)}` : "n/a"}`
  )
}

async function sendTop(i: MessageComponentInteraction, category: string): Promise<void> {
  const content = await buildTop(i, category)
  const body = panel(
    [
      tb(content),
      sep(),
      row(sel({ customId: `frog:topselect:${i.user.id}`, options: TOP_OPTIONS.map((o) => ({ ...o, default: o.value === category })) })),
    ],
    frog
  )
  if (i.customId === "frog:menu") {
    await i.reply({ components: [body], flags: flags_ephemeral })
  } else {
    await i.update({ components: [body] })
  }
}

function summary(guild: Guild) {  const cfg = ensure(guild.id)
  const caught = tot(guild.id)
  const active = cfg.action !== "disabled" && !!cfg.trap_channel
  return tb(
    `## ${meta("froge").tag} Frog\n` +
      `-# ${active ? "● Active" : "○ Not active"}  ·  ${caught} user${caught === 1 ? "" : "s"} caught\n\n` +
      `**Trap** › ${cfg.trap_channel ? `<#${cfg.trap_channel}>` : "Not set"}\n` +
      `**Log** › ${cfg.log_channel ? `<#${cfg.log_channel}>` : "Not set"}\n` +
      `**Action** › ${label[cfg.action]}\n` +
      `**DM** › ${parseTactics(cfg).includes("no_dm") ? "off" : "on"}\n` +
      `**Tactics** › ${parseTactics(cfg).length ? parseTactics(cfg).map((t) => `\`${t}\``).join(" ") : "none"}`
  )
}

function lrow(label: string, desc: string | undefined, comp: any) {
  const row: any = { type: 18, label, component: comp }
  if (desc) row.description = desc
  return row
}

async function openConfig(i: FrogInteraction) {
  const guild = i.guild!
  const cfg = ensure(guild.id)
  const sel = (id: string, cur: string | null) => {
    const defs = cur ? [{ id: cur, type: "channel" }] : []
    return {
      type: 8,
      custom_id: id,
      required: false,
      placeholder: "Select a channel",
      min_values: 0,
      max_values: 1,
      channel_types: [0],
      ...(defs.length ? { default_values: defs } : {}),
    }
  }
  const body = {
    type: 9,
    data: {
      title: "Frog Configuration",
      custom_id: "frog:config:modal",
      components: [
        lrow("Frog Channel", "Any message sent in this channel will cause the author to be kicked/banned from server", {
          ...sel("frog:config:channel", cfg.trap_channel),
          required: true,
          min_values: 1,
          placeholder: "Select a text channel",
        }),
        lrow("Log Channel", "The channel to log events (ie kicks/bans that the bot actioned)", {
          ...sel("frog:config:logchannel", cfg.log_channel),
          placeholder: "Select a channel (optional)",
        }),
        lrow("Action", "What should the bot do to message author?", {
          type: 21,
          custom_id: "frog:config:action",
          required: true,
          options: [
            { label: "Softban (kick)", value: "softban", description: "Kicks the user & deletes last 1hr of messages", default: cfg.action === "softban" },
            { label: "Ban", value: "ban", description: "Permanently bans, also deletes last 1hr of messages", default: cfg.action === "ban" },
            { label: "Disabled", value: "disabled", description: "Monitor only, no action taken", default: cfg.action === "disabled" },
          ],
        }),
        lrow("Tactics", undefined, {
          type: 3,
          custom_id: "frog:config:tactics",
          required: false,
          placeholder: "Select tactics to enable",
          min_values: 0,
          max_values: 6,
          options: tacticsList.map((t) => ({
            type: 1,
            label: tacticNames[t],
            value: t,
            description: t === "no_dm" ? "Don't DM users when caught" : undefined,
            default: parseTactics(cfg).includes(t as never),
          })),
        }),
      ],
    },
  }
  try {
    await i.client.rest.post(Routes.interactionCallback(i.id, i.token), { body })
  } catch (err) {
    console.error("[frog] failed to open config modal", err)
  }
}

async function openMessages(i: FrogInteraction) {
  if (!i.guildId) return;
  const cfg = ensure(i.guildId)
  const input = (id: string, value: string | null, ph: string) => ({
    type: 4,
    custom_id: id,
    style: 2,
    required: false,
    min_length: 0,
    max_length: 4000,
    value: value ?? "",
    placeholder: ph,
  })
  const body = {
    type: 9,
    data: {
      title: "Frog's Messages",
      custom_id: "frog:messages:modal",
      components: [
        lrow("Frog Warning", "This is the message shown in the frog channel", input("warning_msg", cfg.warning_msg ?? "", "Warning message shown in the frog channel")),
        lrow("Frog DM Message", "This is the message sent to users via DM when they trigger the frog", input("dm_msg", cfg.dm_msg ?? "", "Message sent to caught users via DM")),
        lrow("Log Message", "This is the message shown in the log channel", input("log_msg", cfg.log_msg ?? "", "Message shown in the log channel")),
        lrow("Reset All Messages", "Nothing you changed here will persist. This will reset all messages to their default values.", {
          type: 22,
          custom_id: "reset_all",
          required: false,
          min_values: 1,
          max_values: 1,
          options: [
            { label: "Reset All Messages", value: "reset", description: "Nothing you changed here will persist. This will reset all messages to their default values." },
          ],
        }),
      ],
    },
  }
  try {
    await i.client.rest.post(Routes.interactionCallback(i.id, i.token), { body })
  } catch (err) {
    console.error("[frog] failed to open messages modal", err)
  }
}

const nounOf: Record<string, string> = { softban: "kick", ban: "ban", disabled: "no action" }

async function refreshTrapMsg(guild: Guild, cfg: any) {
  if (!cfg.trap_channel || !cfg.trap_msg) return
  const ch = guild.channels.cache.get(cfg.trap_channel)
  if (!ch?.isTextBased()) return
  const warning = fmt(cfg.warning_msg, {
    userTag: "Unknown",
    userId: "0",
    userName: "Unknown",
    serverName: guild.name,
    frogChannelMention: `<#${ch.id}>`,
    frogChannelLink: `https://discord.com/channels/${guild.id}/${ch.id}`,
    actionNoun: nounOf[cfg.action] ?? "kick",
    actionText: "kicked",
    dmTitle: "You were kicked",
  })
  try {
    const m = await ch.messages.fetch(cfg.trap_msg)
    await m.edit({ components: [tmsg(warning, tot(guild.id), meta("gotcha").raw)] })
  } catch {}
}

async function handleMessages(i: ModalSubmitInteraction) {
  const guild = i.guild
  if (!guild) return
  const comps: any[] = []
  const walk = (list: any[]) => {
    for (const c of list ?? []) {
      if (c.customId) comps.push(c)
      if (Array.isArray(c.components)) walk(c.components)
      if (c.component) walk([c.component])
    }
  }
  walk((i as any).components)
  const get = (id: string) => comps.find((c) => c.customId === id)
  const reset = get("reset_all")?.values?.includes("reset")

  if (reset) {
    resetMessages(guild.id)
    const body = panel([tb("**Messages reset to defaults!**")], frog)
    await i.reply({ components: [body], flags: flags_ephemeral }).catch(() => {})
    return
  }

  const fields = [
    { key: "warning_msg", title: "Warning Message" },
    { key: "dm_msg", title: "DM Message" },
    { key: "log_msg", title: "Log Message" },
  ]
  const parts: string[] = []
  for (const f of fields) {
    const val = get(f.key)?.value
    if (val == null) continue
    setMessage(guild.id, f.key as any, val)
    const isDef = val === (messages as any)[f.key === "warning_msg" ? "warning" : f.key === "dm_msg" ? "dm" : "log"]
    if (isDef) {
      parts.push(`${f.title}: *(using default)*`)
    } else {
      parts.push(`**${f.title}**\n${val.split("\n").map((l: string) => `> ${l}`).join("\n")}`)
    }
  }

  const cfg = ensure(guild.id)
  await refreshTrapMsg(guild, cfg)

  const body = panel([tb(`**Messages updated!**\n\n${parts.join("\n\n")}`)], frog)
  await i.reply({ components: [body], flags: flags_ephemeral }).catch(() => {})
}

export async function handleModal(i: ModalSubmitInteraction) {
  if (i.customId === "frog:messages:modal") return handleMessages(i)
  if (i.customId.startsWith("frog:modal:")) {
    // Réservé : futurs modals du hub (aucun pour l'instant, les actions
    // config/customize ouvrent directement leurs modals dédiés).
    return
  }
  try {
    const guild = i.guild
    if (!guild) return
    const comps: any[] = []
    const walk = (list: any[]) => {
      for (const c of list ?? []) {
        if (c.customId) comps.push(c)
        if (Array.isArray(c.components)) walk(c.components)
        if (c.component) walk([c.component])
      }
    }
    walk((i as any).components)
    console.log("[frog] modal submit", i.customId, JSON.stringify(comps).slice(0, 500))
    const get = (id: string) => comps.find((c) => c.customId === id)
    const pick = (id: string) => {
      const c = get(id)
      if (!c) return undefined
      return c.value ?? c.values?.[0]
    }
    const trap = pick("frog:config:channel")
    if (trap) await retarget(guild, trap)
    const logc = pick("frog:config:logchannel")
    setLogChannel(guild.id, logc ?? null)
    const act = pick("frog:config:action")
    if (act) setAction(guild.id, act as FrogAction)
    const tac = get("frog:config:tactics")
    if (tac?.values) setTactics(guild.id, tac.values)
    await renameTrap(guild)

    const cfg = ensure(guild.id)
    const t = parseTactics(cfg)
    const body = panel(
      [
        tb(
          `**Frog configured!**\n` +
            `Channel: ${cfg.trap_channel ? `<#${cfg.trap_channel}>` : "None"}\n` +
            (cfg.log_channel ? `Log Channel: <#${cfg.log_channel}>\n` : "") +
            `Action: ${cfg.action}\n` +
            (t.length ? `Tactics: ${t.map((x) => `\`${x}\``).join(", ")}` : "Tactics: none")
        ),
      ],
      frog
    )
    await i.reply({ components: [body], flags: flags_ephemeral })
    console.log("[frog] config saved for", guild.id)
  } catch (err) {
    console.error("[frog] handleModal failed", err)
    await i
      .reply({ content: "Could not save the configuration.", flags: 64 })
      .catch(() => {})
  }
}

async function score(i: FrogInteraction, guild: Guild) {
  const cfg = ensure(guild.id)
  const t = parseTactics(cfg)
  const ch = cfg.trap_channel ? guild.channels.cache.get(cfg.trap_channel) : null
  const everyone = guild.roles.everyone
  const perms = ch?.isTextBased() ? ch.permissionsFor(everyone) : null
  const isMod = guild.members.me?.permissions.has(PermissionFlagsBits.BanMembers) ?? false
  const dmOn = !t.includes("no_dm")
  const randomOn = t.includes("random_name") || t.includes("random_name_chaos")

  const checks: { w: number; ok: boolean; label: string; help?: string; bonus?: boolean }[] = [
    { w: 10, ok: !!cfg.trap_channel, label: "Trap channel configured", help: "Run `/frog config` and pick a Frog Channel so Frog has somewhere to sit." },
    { w: 10, ok: !!ch, label: "Trap channel still exists in server", help: "The configured trap channel was deleted. Re-run `/frog config` and pick a new Frog Channel." },
    { w: 10, ok: perms?.has(PermissionFlagsBits.ViewChannel) ?? false, label: "Channel visible to @everyone", help: "Give @everyone View Channel on the trap channel — the trap has to look normal." },
    { w: 10, ok: perms?.has(PermissionFlagsBits.SendMessages) ?? false, label: "Channel writeable by @everyone", help: "Make sure @everyone can send messages in the trap channel, otherwise nobody can fall into it." },
    { w: 10, ok: isMod, label: "Bot has Ban Members permission", help: "Grant the bot the Ban Members permission so it can actually enforce the trap." },
    { w: 10, ok: cfg.action !== "disabled", label: "Action is not Disabled", help: "The action is set to Disabled — Frog is monitoring only. Run `/frog config` and set Action to Softban or Ban." },
    { w: 10, ok: !!cfg.log_channel && !!guild.channels.cache.get(cfg.log_channel), label: "Log channel configured", help: "Run `/frog config` and set a Log Channel so your mod team is notified of every catch." },
    { w: 10, ok: dmOn, label: "DM notifications enabled", help: "Remove the `no_dm` tactic in `/frog config` so caught users get a DM." },
    { w: 10, ok: cfg.action === "ban", label: "Action set to Ban (permanent)", help: "Softban kicks and wipes messages but the account can rejoin. Switch to Ban in `/frog config` for a permanent block.", bonus: true },
    { w: 10, ok: randomOn, label: "Random Name tactic enabled", help: "Enable Random Name or Random Name (Chaos) in `/frog config` tactics. Daily renames make the channel harder to recognize and avoid.", bonus: true },
  ]

  const pts = checks.filter((c) => c.ok).reduce((s, c) => s + c.w, 0)
  const grade = pts >= 95 ? ["A", "Excellent"] : pts >= 85 ? ["B", "Good"] : pts >= 70 ? ["C", "Adequate"] : pts >= 55 ? ["D", "Weak"] : ["F", "Poor"]
  const col = pts >= 85 ? 0x22c55e : pts >= 70 ? 0xf4a435 : 0xed4337
  const g = meta("green").tag
  const r = meta("red").tag

  const prev = cfg.last_score
  const diff = prev == null ? null : pts - prev
  setScore(guild.id, pts)

  const list = checks
    .map((c) => `${c.ok ? g : r} ${c.label}${!c.ok && c.bonus ? "  *+10 pts*" : ""}`)
    .join("\n")
  const advice = checks.filter((c) => !c.ok).map((c) => `- **${c.label}** — ${c.help}`)

  const blocks = [
    tb(
      `## ${meta("frogwow").tag} Security Rating: **${grade[0]}** — ${grade[1]}\n` +
        `-# Score: ${pts} / 100` +
        (diff != null ? (diff >= 0 ? ` · ↑ +${diff} since last check` : ` · ↓ ${diff} since last check`) : "")
    ),
    sep(),
    tb(list),
  ]
  if (advice.length) {
    blocks.push(sep(), tb(`### How to improve\n${advice.join("\n")}`))
  }
  return i.reply({ components: [panel(blocks, col)], flags: flags_ephemeral })
}
