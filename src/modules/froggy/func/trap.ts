import type { GuildTextBasedChannel } from "discord.js"

export interface RenderCtx {
  userTag: string
  userId: string
  userName: string
  serverName: string
  frogChannelMention: string
  frogChannelLink: string
  actionNoun: string
  actionText: string
  dmTitle: string
}

export function fmt(tpl: string, c: RenderCtx): string {
  return tpl
    .replaceAll("{{user:tag}}", c.userTag)
    .replaceAll("{{user:id}}", c.userId)
    .replaceAll("{{user:name}}", c.userName)
    .replaceAll("{{server:name}}", c.serverName)
    .replaceAll("{{frog:channel:mention}}", c.frogChannelMention)
    .replaceAll("{{frog:channel:link}}", c.frogChannelLink)
    .replaceAll("{{action:noun}}", c.actionNoun)
    .replaceAll("{{action:text}}", c.actionText)
    .replaceAll("{{dm:title}}", c.dmTitle)
}

export function tmsg(warning: string, n: number, emoji?: { id?: string; name?: string }): any {
  return {
    type: 17,
    accent_color: 0x1d3f3a,
    components: [
      { type: 10, content: warning },
      { type: 1, components: [{ type: 2, style: 2, custom_id: "frog:counter", disabled: true, label: `Flies Caught: ${n}`, ...(emoji ? { emoji } : {}) }] },
    ],
  }
}

export function isCounterMsg(msg: any): boolean {
  return JSON.stringify((msg.components[0] as any)?.toJSON?.() ?? msg.components[0] ?? {}).includes("frog:counter")
}

export async function bump(ch: GuildTextBasedChannel, msgId: string, warning: string, n: number, emoji?: { id?: string; name?: string }): Promise<void> {
  try {
    const m = await ch.messages.fetch(msgId)
    await m.edit({ components: [tmsg(warning, n, emoji)] })
  } catch {}
}

export const flag_v2 = 1 << 15
