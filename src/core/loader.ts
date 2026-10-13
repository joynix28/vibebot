import { readdir } from "node:fs/promises";
import path from "node:path";
import { Collection, Routes } from "discord.js";
import type { Client } from "discord.js";
import type { Command, BotEvent, ModuleMeta } from "./types.ts";

const ROOT = path.resolve(import.meta.dir, ".."); // fusion/src
const MODULES_DIR = path.join(ROOT, "modules");

async function walk(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
      files.push(full);
    }
  }
  return files;
}

async function moduleCommandRoots(): Promise<{ root: string; module?: string }[]> {
  const roots: { root: string; module?: string }[] = [{ root: path.join(ROOT, "core", "commands") }];
  let entries;
  try {
    entries = await readdir(MODULES_DIR, { withFileTypes: true });
  } catch {
    return roots;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) roots.push({ root: path.join(MODULES_DIR, entry.name, "commands"), module: entry.name });
  }
  return roots;
}

async function moduleEventRoots(): Promise<string[]> {
  const roots: string[] = [path.join(ROOT, "core", "events")];
  let entries;
  try {
    entries = await readdir(MODULES_DIR, { withFileTypes: true });
  } catch {
    return roots;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) roots.push(path.join(MODULES_DIR, entry.name, "events"));
  }
  return roots;
}

export async function loadCmds(client: Client): Promise<void> {
  client.commands = new Collection();
  for (const { root, module } of await moduleCommandRoots()) {
    for (const file of await walk(root)) {
      const cmd = (await import(file)) as Partial<Command>;
      if (!cmd.data?.name) continue;
      if (client.commands.has(cmd.data.name)) {
        console.warn(`[cmd] doublon ignoré: /${cmd.data.name} (${file})`);
        continue;
      }
      // Les namespaces de modules ES sont gelés : on enveloppe au lieu de muter.
      const full: Command = { ...(cmd as Command), module };
      client.commands.set(full.data.name, full);
      console.log(`[cmd] /${full.data.name}${module ? ` [${module}]` : ""}`);
    }
  }
}

export async function loadEvts(client: Client): Promise<void> {
  for (const root of await moduleEventRoots()) {
    for (const file of await walk(root)) {
      const evt = (await import(file)) as Partial<BotEvent>;
      if (!evt.name || !evt.execute) continue;
      if (evt.once) {
        client.once(evt.name, (...args) => evt.execute!(...args));
      } else {
        client.on(evt.name, (...args) => evt.execute!(...args));
      }
      console.log(`[evt] ${evt.name} (${path.basename(file)})`);
    }
  }
}

export async function regSlash(client: Client): Promise<void> {
  const body = [...client.commands.values()].map((c) => c.data.toJSON());
  const appId = client.user?.id;
  if (!appId) return;
  try {
    await client.rest.put(Routes.applicationCommands(appId), { body });
    console.log(`[cmd] ${body.length} commandes slash enregistrées`);
  } catch (err) {
    console.error("[commands] échec de l'enregistrement", err);
  }
}

/** Lit les métadonnées de tous les modules (src/modules/<id>/module.json). */
export async function loadModuleMetas(): Promise<ModuleMeta[]> {
  const metas: ModuleMeta[] = [];
  let entries;
  try {
    entries = await readdir(MODULES_DIR, { withFileTypes: true });
  } catch {
    return metas;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const raw = await Bun.file(path.join(MODULES_DIR, entry.name, "module.json")).text();
      const meta = JSON.parse(raw) as ModuleMeta;
      metas.push({ ...meta, id: entry.name });
    } catch {
      metas.push({ id: entry.name, name: entry.name, emoji: "📦", description: "" });
    }
  }
  return metas.sort((a, b) => a.name.localeCompare(b.name));
}
