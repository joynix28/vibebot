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
import type { MessageActionRowComponentBuilder } from "discord.js";

// Helpers d'interface partagés (Components V2), repris des bots d'origine.

export const ACCENT = 0x36373e;
export const GREEN = 0x2ecc71;
export const RED = 0xe74c3c;
export const BLUE = 0x3498db;
export const GOLD = 0xf1c40f;

export const FLAGS_V2: number = MessageFlags.IsComponentsV2;
export const FLAGS_V2_EPHEMERAL: number = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export type PanelBlock =
  | { type: "text"; content: string }
  | { type: "sep"; divider: boolean; spacing: SeparatorSpacingSize }
  | { type: "media"; items: { url: string; description?: string }[] };

export function panel(blocks: PanelBlock[], accent: number = ACCENT): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(accent);
  for (const block of blocks) {
    if (block.type === "text") {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
    } else if (block.type === "sep") {
      container.addSeparatorComponents(new SeparatorBuilder().setDivider(block.divider).setSpacing(block.spacing));
    } else if (block.type === "media") {
      const gallery = new MediaGalleryBuilder();
      for (const i of block.items) {
        const item = new MediaGalleryItemBuilder().setURL(i.url);
        if (i.description) item.setDescription(i.description);
        gallery.addItems(item);
      }
      container.addMediaGalleryComponents(gallery);
    }
  }
  return container;
}

export function textBlock(content: string): PanelBlock {
  return { type: "text", content };
}

export function msgPanel(content: string, accent: number = ACCENT): ContainerBuilder {
  return panel([textBlock(content)], accent);
}

export function okPanel(content: string): ContainerBuilder {
  return msgPanel(content, GREEN);
}

export function errPanel(content: string): ContainerBuilder {
  return msgPanel(content, RED);
}

export function sepBlock(
  divider = true,
  spacing: SeparatorSpacingSize = SeparatorSpacingSize.Small
): PanelBlock {
  return { type: "sep", divider, spacing };
}

export function mediaBlock(items: { url: string; description?: string }[]): PanelBlock {
  return { type: "media", items };
}

export function actionRow(...components: ButtonBuilder[]): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...components);
}

export function button(
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

export function linkBtn(
  url: string,
  label: string,
  emoji?: string | { id: string; name?: string }
): ButtonBuilder {
  const b = new ButtonBuilder().setURL(url).setStyle(ButtonStyle.Link);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  return b;
}

export function field(label: string, value: string): string {
  return `> **${label}:** \`${value}\``;
}

export function fieldRaw(label: string, value: string): string {
  return `> **${label}:** ${value}`;
}
