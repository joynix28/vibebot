import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";
import type { MessageActionRowComponentBuilder } from "discord.js";

export const ACCENT = 0x36373e;

export const FLAGS_V2: number = MessageFlags.IsComponentsV2;
export const FLAGS_V2_EPHEMERAL: number = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export const IMAGE_SCOPES = [
  "image.upload",
  "image.read",
  "image.list",
  "image.delete",
  "image.report",
];

export type PanelBlock =
  | { type: "text"; content: string }
  | { type: "sep"; divider: boolean; spacing: SeparatorSpacingSize }
  | { type: "section"; texts: string[]; button?: ButtonBuilder; thumbnail?: ThumbnailBuilder }
  | { type: "media"; items: { url: string; description?: string }[] }
  | { type: "row"; components: (ButtonBuilder | StringSelectMenuBuilder)[] };

export function panel(blocks: PanelBlock[], accent: number = ACCENT): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(accent);
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.content));
        break;
      case "sep":
      container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(block.divider).setSpacing(block.spacing)
        );
        break;
    case "section": {
        if (!block.button && !block.thumbnail) {
          container.addTextDisplayComponents(
            ...block.texts.map((t) => new TextDisplayBuilder().setContent(t))
          );
          break;
        }
        const section = new SectionBuilder().addTextDisplayComponents(
          ...block.texts.map((t) => new TextDisplayBuilder().setContent(t))
        );
        if (block.button) section.setButtonAccessory(block.button);
        if (block.thumbnail) section.setThumbnailAccessory(block.thumbnail);
        container.addSectionComponents(section);
        break;
    }
      case "media": {
        const gallery = new MediaGalleryBuilder();
        for (const i of block.items) {
          const item = new MediaGalleryItemBuilder().setURL(i.url);
          if (i.description) item.setDescription(i.description);
          gallery.addItems(item);
        }
        container.addMediaGalleryComponents(gallery);
        break;
      }
      case "row":
        container.addActionRowComponents(
          new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...block.components)
        );
        break;
    }
  }
  return container;
}

export function textBlock(content: string): PanelBlock {
  return { type: "text", content };
}

export function sepBlock(
  divider = true,
  spacing: SeparatorSpacingSize = SeparatorSpacingSize.Small
): PanelBlock {
  return { type: "sep", divider, spacing };
}

export function sectBlock(
  texts: string[],
  opts: { button?: ButtonBuilder; thumbnail?: ThumbnailBuilder } = {}
): PanelBlock {
  return { type: "section", texts, ...opts };
}

export function rowBlock(...components: (ButtonBuilder | StringSelectMenuBuilder)[]): PanelBlock {
  return { type: "row", components };
}

export function mediaBlock(items: { url: string; description?: string }[]): PanelBlock {
  return { type: "media", items };
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

export function option(
  label: string,
  value: string,
  opts: { description?: string; emoji?: string; isDefault?: boolean } = {}
): StringSelectMenuOptionBuilder {
  const o = new StringSelectMenuOptionBuilder().setLabel(label).setValue(value);
  if (opts.description) o.setDescription(opts.description);
  if (opts.emoji) o.setEmoji(opts.emoji);
  if (opts.isDefault) o.setDefault(true);
  return o;
}

export function thumbnail(url: string, description?: string): ThumbnailBuilder {
  const t = new ThumbnailBuilder().setURL(url);
  if (description) t.setDescription(description);
  return t;
}

export function headerBlock(titleText: string, subtitleText?: string, avatarUrl?: string): PanelBlock {
  const texts = [title(titleText)];
  if (subtitleText) texts.push(line(subtitleText));
  if (avatarUrl) {
    return { type: "section", texts, thumbnail: thumbnail(avatarUrl) };
  }
  return { type: "text", content: texts.join("\n") };
}

export function relative(ts: number | null | undefined): string {
  if (!ts) return "jamais";
  return `<t:${Math.floor(ts / 1000)}:R>`;
}

export function title(text: string): string {
  return `# ${text}`;
}

export function line(text: string): string {
  return `> ${text}`;
}

export function field(label: string, value: string): string {
  return `> **${label}:** \`${value}\``;
}

export function fieldRaw(label: string, value: string): string {
  return `> **${label}:** ${value}`;
}

export function footnote(text: string): string {
  return `-# ${text}`;
}

export function boldTitle(text: string): string {
  return `**# ${text}**`;
}

export function count(label: string, n: number): string {
  return `> ${label} : **${n}**`;
}

export function codeBlock(language: string, content: string): PanelBlock {
  return textBlock(`\`\`\`${language}\n${content}\n\`\`\``);
}

export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return "jamais";
  return new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

export function parseDur(duration: string): number {
  const m = /^(\d+)([smhdw])$/.exec(duration);
  if (!m) return Date.now() + 30 * 86_400_000;
  const amount = Number(m[1]);
  const mult: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return Date.now() + amount * (mult[m[2] ?? "d"] ?? 86_400_000);
}