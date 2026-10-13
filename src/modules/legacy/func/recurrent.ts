import type { Client, TextBasedChannel } from "discord.js";
import { FLAGS_V2, BLUE, panel, textBlock } from "../../../core/ui.ts";
import {
  getRecurrent,
  listAllRecurrents,
  setRecurrentLastSent,
} from "./db-plus.ts";
import type { RecurrentRow } from "./db-plus.ts";

// Registre des intervalles actifs (id -> timer). Persistés en DB, relancés au boot.

const timers = new Map<number, NodeJS.Timeout>();

async function sendRecurrent(client: Client, id: number): Promise<void> {
  const row = getRecurrent(id);
  if (!row || !row.enabled) {
    unscheduleRecurrent(id);
    return;
  }
  const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
  if (!guild) return;
  const channel = (await guild.channels.fetch(row.channel_id).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isSendable()) return;
  await channel
    .send({ components: [panel([textBlock(row.message)], BLUE)], flags: FLAGS_V2 })
    .catch(() => {});
  setRecurrentLastSent(id, Date.now());
}

/** (Re)programme l'envoi périodique d'un message récurrent. */
export function scheduleRecurrent(client: Client, row: RecurrentRow): void {
  unscheduleRecurrent(row.id);
  const ms = row.interval_min * 60_000;
  timers.set(
    row.id,
    setInterval(() => {
      void sendRecurrent(client, row.id).catch((err) => console.error(`[legacy] échec envoi récurrent #${row.id}`, err));
    }, ms)
  );
}

/** Arrête l'envoi périodique d'un message récurrent. */
export function unscheduleRecurrent(id: number): void {
  const timer = timers.get(id);
  if (timer) {
    clearInterval(timer);
    timers.delete(id);
  }
}

/** Relance tous les messages récurrents au démarrage du bot. */
export function restoreRecurrents(client: Client): void {
  let n = 0;
  for (const row of listAllRecurrents()) {
    scheduleRecurrent(client, row);
    n++;
  }
  console.log(`[legacy] messages récurrents : ${n} intervalle(s) restauré(s)`);
}
