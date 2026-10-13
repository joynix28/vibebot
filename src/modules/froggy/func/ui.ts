import { ButtonStyle, MessageFlags } from "discord.js"

export const accent = 0x36373e
export const frog = 0x1d3f3a
export const green = 0x59c231
export const gold = 0xfcb614
export const red = 0xed4337

export const flag_v2 = 1 << 15
export const flags_v2 = flag_v2
export const flags_ephemeral = flag_v2 | MessageFlags.Ephemeral

export type Content =
  | { type: 10; content: string }
  | { type: 14; divider: boolean; spacing: number }
  | { type: 15; items: { url: string; description?: string }[] }
  | { type: 1; components: unknown[] }

export function tb(content: string): Content {
  return { type: 10, content }
}

export function hd(title: string): Content {
  return tb(`**${title}**`)
}

export function sep(divider = true, spacing = 1): Content {
  return { type: 14, divider, spacing }
}

export function gfx(items: { url: string; description?: string }[]): Content {
  return { type: 15, items }
}

export function row(...components: unknown[]): Content {
  return { type: 1, components }
}

export function panel(blocks: Content[], col: number = accent): any {
  return { type: 17, accent_color: col, components: blocks }
}

export function mp(content: string, col: number = accent): any {
  return panel([tb(content)], col)
}

export type Button = { type: 2 }

export function lnk(url: string, label: string, emoji?: { id?: string; name?: string } | string): Button {
  const b: any = { type: 2, style: ButtonStyle.Link, url, label }
  if (emoji !== undefined) b.emoji = typeof emoji === "string" ? { name: emoji } : emoji
  return b
}

export function button(
  customId: string,
  label: string,
  style: number = ButtonStyle.Secondary,
  emoji?: { id?: string; name?: string } | string,
  disabled = false
): Button {
  const b: any = { type: 2, style, custom_id: customId, label }
  if (emoji !== undefined) b.emoji = typeof emoji === "string" ? { name: emoji } : emoji
  if (disabled) b.disabled = true
  return b
}

export function sel(opts: {
  customId: string
  options: { label: string; value: string; description?: string; emoji?: string | { name: string } | { id: string; name: string }; default?: boolean }[]
  placeholder?: string
  minValues?: number
  maxValues?: number
}): Record<string, unknown> {
  return {
    type: 3,
    custom_id: opts.customId,
    placeholder: opts.placeholder ?? "Select an option",
    min_values: opts.minValues ?? 1,
    max_values: opts.maxValues ?? 1,
    options: opts.options.map((o) => ({
      label: o.label,
      value: o.value,
      description: o.description,
      default: o.default,
      emoji: o.emoji === undefined ? undefined : typeof o.emoji === "string" ? { name: o.emoji } : o.emoji,
    })),
  }
}
