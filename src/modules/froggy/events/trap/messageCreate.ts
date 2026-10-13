import { Events, ChannelType } from "discord.js"
import type { Message, GuildMember } from "discord.js"
import {
  ensure,
  parseTactics,
  addCatch,
  tot,
  action_noun,
  action_text,
  type FrogAction,
} from "../../func/db.ts"
import { fmt, bump } from "../../func/trap.ts"
import { em, meta } from "../../func/emoji.ts"

export const name = Events.MessageCreate

const age = 7 * 24 * 60 * 60 * 1000
const ttl = 10_000

async function tease(member: GuildMember, kind: "owner" | "admin" | "role") {
  const m = `<@${member.id}>`
  if (kind === "owner")
    return `${em("frogwow")} ${m} triggered the frog... but that's the **server owner**. Even frog has limits.\n-# If this is a test, frog passed. If not, consider the irony.`
  if (kind === "admin")
    return `${em("frogcry")} ${m} triggered the frog... but they're an **admin**. Frog bows to authority.\n-# The trap stays hungry.`
  return `${em("froghuh")} ${m} triggered the frog... but their role outranks the frog. Respect the hierarchy.\n-# Not everything that hops should be caught.`
}

function who(member: GuildMember) {
  if (member.id === member.guild.ownerId) return "owner"
  const p = member.permissions
  if (p.has("Administrator") || p.has("ManageGuild") || p.has("BanMembers") || p.has("KickMembers")) return "admin"
  const me = member.guild.members.me
  if (me && member.roles.highest.position >= me.roles.highest.position) return "role"
  return null
}

export async function execute(message: Message) {
  const guild = message.guild
  if (!guild || message.author.bot) return

  const cfg = ensure(guild.id)
  if (!cfg.trap_channel || message.channelId !== cfg.trap_channel) return
  if (message.channel.type !== ChannelType.GuildText) return

  const ch = message.channel
  const tactics = parseTactics(cfg)
  const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null))
  if (!member) return
  const action = cfg.action as FrogAction

  const kind = who(member)
  if (kind) {
    await message.delete().catch(() => {})
    const nudge = await ch.send({ content: await tease(member, kind) }).catch(() => null)
    if (nudge) setTimeout(() => nudge.delete().catch(() => {}), ttl)
    return
  }

  if (tactics.includes("new_account_only")) {
    const born = member.user.createdTimestamp
    if (born && Date.now() - born > age) {
      await message.delete().catch(() => {})
      return
    }
  }

  if (action === "disabled") {
    await message.delete().catch(() => {})
    return
  }

  const ctx = {
    userTag: member.user.username,
    userId: member.id,
    userName: member.user.displayName ?? member.user.username,
    serverName: guild.name,
    frogChannelMention: `<#${ch.id}>`,
    frogChannelLink: `https://discord.com/channels/${guild.id}/${ch.id}`,
    actionNoun: action_noun[action],
    actionText: action_text[action],
    dmTitle: action === "ban" ? "You were banned" : "You were kicked",
  }
  const sent = message.content.slice(0, 200) || "*attachment*"

  try {
    if (action === "ban") {
      await guild.bans.create(member, { deleteMessageSeconds: 3600, reason: `Sent a message in the frog trap channel: ${sent}` })
    } else {
      await member.kick(`Sent a message in the frog trap channel: ${sent}`)
    }
  } catch (err) {
    console.error(`[frog] punishment failed for ${member.id} in ${guild.id}`, err)
    return
  }
  await message.delete().catch(() => {})

  addCatch(guild.id, member.id, action)
  if (cfg.trap_msg) await bump(ch as any, cfg.trap_msg, fmt(cfg.warning_msg, ctx), tot(guild.id), meta("gotcha").raw)

  if (!tactics.includes("no_dm")) {
    let dm = fmt(cfg.dm_msg, ctx)
    if (tactics.includes("dm_rejoin")) {
      const inv = await ch.createInvite({ maxAge: 0, reason: "frog dm_rejoin" }).catch(() => null)
      if (inv) dm += `\n\nRejoin: ${inv.url}`
    }
    await member.send({ content: dm }).catch(() => {})
  }

  if (cfg.log_channel) {
    const log = guild.channels.cache.get(cfg.log_channel)
    if (log?.isTextBased()) {
      await log.send({ content: fmt(cfg.log_msg, ctx) }).catch(() => {})
    }
  }
}
