import { Routes } from "discord.js";
import type { Client } from "discord.js";

interface Source {
  key: string
  name: string
  fallback: string
  fromId: string
}

export const sources: Source[] = [
  { key: "froge", name: "froge", fallback: "🐸", fromId: "1501238715064782990" },
  { key: "froghuh", name: "froghuh", fallback: "🤔", fromId: "1501241202639634615" },
  { key: "gotcha", name: "gotcha", fallback: "🪰", fromId: "1501241303848063066" },
  { key: "frogcry", name: "frogcry", fallback: "😢", fromId: "1501275721585393785" },
  { key: "frogwow", name: "frogwow", fallback: "😮", fromId: "1501275817022328963" },
  { key: "green", name: "green", fallback: "🟢", fromId: "1501513815710502922" },
  { key: "red", name: "red", fallback: "🔴", fromId: "1501513842969153709" },
];

const tags = new Map<string, string>();

export function em(key: string): string {
  return tags.get(key) ?? sources.find((s) => s.key === key)?.fallback ?? "";
}

export interface EmojiMeta {
  tag: string;
  raw?: { id?: string; name?: string };
}

export function meta(key: string): EmojiMeta {
  const t = tags.get(key);
  const src = sources.find((s) => s.key === key);
  if (t && src) {
    const id = t.match(/:(\d+)>$/)?.[1];
    return { tag: t, raw: { id, name: src.name } };
  }
  return { tag: src?.fallback ?? "", raw: src ? { name: src.fallback } : undefined };
}

export function hasEmoji(key: string): boolean {
  return tags.has(key);
}

async function fetchDataUri(emojiId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cdn.discordapp.com/emojis/${emojiId}.png`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function seed(client: Client): Promise<void> {
  const appId = client.user?.id;
  if (!appId) return;

  let existing: Record<string, string> = {};
  try {
    const list = (await client.rest.get(Routes.applicationEmojis(appId))) as { items?: { id: string; name: string }[] };
    existing = Object.fromEntries((list.items ?? []).map((e) => [e.name, e.id]));
  } catch {}

  for (const src of sources) {
    const known = existing[src.name];
    if (known) {
      tags.set(src.key, `<:${src.name}:${known}>`);
      continue;
    }
    const image = await fetchDataUri(src.fromId);
    if (!image) {
      console.log(`[emoji] skip ${src.name}: could not fetch source image`);
      continue;
    }
    try {
      const created = (await client.rest.post(Routes.applicationEmojis(appId), {
        body: { name: src.name, image },
      })) as { id: string; name: string };
      tags.set(src.key, `<:${created.name}:${created.id}>`);
      console.log(`[emoji] created :${created.name}:`);
    } catch (err) {
      console.error(`[emoji] failed to create :${src.name}:`, err);
    }
  }
}
