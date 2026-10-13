import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";
import type { MessageActionRowComponentBuilder, ChatInputCommandInteraction, User } from "discord.js";

export const acc = 0x36373e;
export const gold = 0xfcb614;
export const red = 0xed4337;
export const blue = 0x297fb9;

export const V2: number = MessageFlags.IsComponentsV2;
export const V2E: number = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export type Blk =
  | { type: "text"; content: string }
  | { type: "sep"; divider: boolean; spacing: SeparatorSpacingSize }
  | { type: "media"; items: { url: string; description?: string }[] };

export function panel(blocks: Blk[], accent: number = acc): ContainerBuilder {
  const c = new ContainerBuilder().setAccentColor(accent);
  for (const b of blocks) {
    if (b.type === "text") {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(b.content));
    } else if (b.type === "sep") {
      c.addSeparatorComponents(new SeparatorBuilder().setDivider(b.divider).setSpacing(b.spacing));
    } else if (b.type === "media") {
      const gal = new MediaGalleryBuilder();
      for (const i of b.items) {
        const it = new MediaGalleryItemBuilder().setURL(i.url);
        if (i.description) it.setDescription(i.description);
        gal.addItems(it);
      }
      c.addMediaGalleryComponents(gal);
    }
  }
  return c;
}

export function tx(content: string): Blk {
  return { type: "text", content };
}

// panel with optional action rows inside the container
export function panelWith(blocks: Blk[], ...rows: ActionRowBuilder<any>[]): ContainerBuilder {
  const c = new ContainerBuilder().setAccentColor(acc);
  for (const b of blocks) {
    if (b.type === "text") {
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent(b.content));
    } else if (b.type === "sep") {
      c.addSeparatorComponents(new SeparatorBuilder().setDivider(b.divider).setSpacing(b.spacing));
    }
  }
  for (const r of rows) c.addActionRowComponents(r);
  return c;
}

// top-level text display (message display), replaces content for v2 messages
export function td(content: string): TextDisplayBuilder {
  return new TextDisplayBuilder().setContent(content);
}

export function mp(content: string, accent: number = acc): ContainerBuilder {
  return panel([tx(content)], accent);
}

export function tt(title: string): Blk {
  return tx(`**${title}**`);
}

// status container -- replaces the old status embeds. optional action rows go inside the container
export function st(name: string, color: number, desc: string, ...rows: ActionRowBuilder<any>[]): ContainerBuilder {
  const c = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      (td) => td.setContent(`**${name}**`),
      (td) => td.setContent(desc)
    );
  for (const r of rows) c.addActionRowComponents(r);
  return c;
}

export function confirmed(body: string, user?: User | null, accent: number = gold): ContainerBuilder {
  const blocks: Blk[] = [tt("Action Confirmed"), tx(body)];
  if (user) blocks.push(ft(user));
  return panel(blocks, accent);
}

export function cancelled(body: string, user?: User | null): ContainerBuilder {
  const blocks: Blk[] = [tt("Action Cancelled"), tx(body)];
  if (user) blocks.push(ft(user));
  return panel(blocks, red);
}

export function ft(user: User | null | undefined): Blk {
  return tx(`> Invoked by @${user?.username ?? "Unknown"}`);
}

let cmdCache: { name: string; id: string }[] | null = null;
let cacheAt = 0;

async function getCmdCache(interaction: ChatInputCommandInteraction): Promise<{ name: string; id: string }[]> {
  if (cmdCache && Date.now() - cacheAt < 60000) return cmdCache;
  try {
    const cmds = await interaction.client.application?.commands?.fetch();
    if (cmds) {
      cmdCache = [...cmds.values()].map((c) => ({ name: c.name, id: c.id }));
      cacheAt = Date.now();
      return cmdCache;
    }
  } catch {}
  const cached = interaction.client.application?.commands?.cache;
  if (cached) return [...cached.values()].map((c) => ({ name: c.name, id: c.id }));
  return [];
}

export async function cMention(interaction: ChatInputCommandInteraction, path: string): Promise<string> {
  const root = path.split(" ")[0] ?? path;
  const cmds = await getCmdCache(interaction);
  const cmd = cmds.find((c) => c.name === root);
  return cmd ? `</${path}:${cmd.id}>` : `\`/${path}\``;
}

export function sep(
  divider = true,
  spacing: SeparatorSpacingSize = SeparatorSpacingSize.Small
): Blk {
  return { type: "sep", divider, spacing };
}

export function med(items: { url: string; description?: string }[]): Blk {
  return { type: "media", items };
}

export function row(...components: ButtonBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components);
}

export function btn(
  customId: string,
  label: string,
  style: ButtonStyle,
  emoji?: string | { id: string; name?: string },
  disabled = false
): ButtonBuilder {
  const b = new ButtonBuilder().setCustomId(customId).setStyle(style);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}

export function lnk(
  url: string,
  label: string,
  emoji?: string | { id: string; name?: string }
): ButtonBuilder {
  const b = new ButtonBuilder().setURL(url).setStyle(ButtonStyle.Link);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  return b;
}

export function fld(label: string, value: string): string {
  return `> **${label}:** \`${value}\``;
}

export function fldRaw(label: string, value: string): string {
  return `> **${label}:** ${value}`;
}
