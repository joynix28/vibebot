import { ChannelType } from "discord.js"
import type { Guild, GuildTextBasedChannel } from "discord.js"
import {
  ensure,
  setTrapChannel,
  setTrapMsg,
  setAction,
  tot,
  action_noun,
  messages,
  parseTactics,
} from "./db.ts"
import { fmt, tmsg, flag_v2 } from "./trap.ts"
import { meta } from "./emoji.ts"

const names = [
  "never-type-here",
  "not-for-chatting",
  "the-pond",
  "fly-catcher",
  "do-not-send",
  "quiet-zone",
  "ribbit",
  "bait",
  "swamp-talk",
  "message-free",
  "look-only",
  "trap-door",
  "no-reply",
  "read-only",
  "thinking-spot",
  "logs-and-frogs",
  "the-tongue",
  "spam-detector",
  "here-be-frogs",
]

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)] as T
}

export async function renameTrap(guild: Guild) {
  const cfg = ensure(guild.id)
  if (!cfg.trap_channel) return
  const t = parseTactics(cfg)
  const ch = guild.channels.cache.get(cfg.trap_channel)
  if (!ch) return
  if (t.includes("random_name_chaos")) {
    const len = 5 + Math.floor(Math.random() * 4)
    let s = ""
    for (let i = 0; i < len; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)]
    await ch.setName(s).catch(() => {})
  } else if (t.includes("random_name")) {
    await ch.setName(pick(names)).catch(() => {})
  }
}

async function postTrap(guild: Guild, ch: GuildTextBasedChannel) {
  const cfg = ensure(guild.id)
  const act = cfg.action === "disabled" ? "softban" : cfg.action
  const warning = fmt(messages.warning, {
    userTag: "Unknown",
    userId: "0",
    userName: "Unknown",
    serverName: guild.name,
    frogChannelMention: `<#${ch.id}>`,
    frogChannelLink: `https://discord.com/channels/${guild.id}/${ch.id}`,
    actionNoun: action_noun[act],
    actionText: "kicked",
    dmTitle: "You were kicked",
  })
  try {
    const n = tot(guild.id)
    const msg = await ch.send({
      components: [tmsg(warning, n, meta("gotcha").raw)],
      flags: flag_v2,
    })
    setTrapMsg(guild.id, msg.id)
    console.log(`[frog] trap message posted in ${guild.name} (${ch.id})`)
  } catch (err) {
    console.error(`[frog] failed to post trap message in ${guild.id}`, err)
  }
}

export async function setup(guild: Guild) {
  const cfg = ensure(guild.id)
  if (cfg.trap_channel) {
    const cur = guild.channels.cache.get(cfg.trap_channel)
    if (cur && cur.isTextBased() && cur.type === ChannelType.GuildText) {
      if (cfg.trap_msg) return
      await postTrap(guild, cur as GuildTextBasedChannel)
      return
    }
  }
  let ch: GuildTextBasedChannel
  try {
    const made = await guild.channels.create({
      name: "frog",
      type: ChannelType.GuildText,
      topic: "Trap channel for spam bots. Sending a message here triggers Frog.",
    })
    ch = made as GuildTextBasedChannel
    console.log(`[frog] created #frog in ${guild.name} (${guild.id})`)
  } catch (err) {
    console.error(`[frog] could not create frog channel in ${guild.id}`, err)
    return
  }

  setTrapChannel(guild.id, ch.id)
  if (cfg.action === "disabled") setAction(guild.id, "softban")
  await postTrap(guild, ch)
}

export async function retarget(guild: Guild, newChannelId: string) {
  const cfg = ensure(guild.id)
  if (cfg.trap_channel === newChannelId) return
  if (cfg.trap_channel && cfg.trap_msg) {
    const old = guild.channels.cache.get(cfg.trap_channel)
    if (old?.isTextBased()) {
      try {
        const m = await old.messages.fetch(cfg.trap_msg)
        await m.delete()
      } catch {}
    }
  }
  setTrapMsg(guild.id, null)
  setTrapChannel(guild.id, newChannelId)
  if (cfg.action === "disabled") setAction(guild.id, "softban")
  const ch = guild.channels.cache.get(newChannelId)
  if (!ch || !ch.isTextBased() || ch.type !== ChannelType.GuildText) return
  await postTrap(guild, ch as GuildTextBasedChannel)
  console.log(`[frog] trap moved to ${newChannelId}`)
}
