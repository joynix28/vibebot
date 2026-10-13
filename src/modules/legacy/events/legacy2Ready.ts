import { Events } from "discord.js";
import type { Client } from "discord.js";
import { restoreJailTimers, releaseDueJails } from "../commands/prison.ts";
import { restoreRecurrents } from "../func/recurrent.ts";

// Boot du module legacy "étendu" (legacy2) : restaure les timers de prison
// et les intervalles de messages récurrents persistés en DB.
// Cohabite avec les autres schedulers ClientReady du module.

export const name = Events.ClientReady;
export const once = true;

const JAIL_SWEEP_MS = 5 * 60 * 1000;

export async function execute(client: Client): Promise<void> {
  try {
    await restoreJailTimers(client);
  } catch (err) {
    console.error("[legacy] erreur restauration timers prison", err);
  }
  try {
    restoreRecurrents(client);
  } catch (err) {
    console.error("[legacy] erreur restauration messages récurrents", err);
  }
  // Filet de sécurité : libère les peines expirées toutes les 5 minutes
  // (au cas où un setTimeout aurait été manqué).
  setInterval(() => {
    void releaseDueJails(client).catch((err) => console.error("[legacy] erreur sweep prison", err));
  }, JAIL_SWEEP_MS);
  console.log("[legacy] boot legacy2 terminé (prison + messages récurrents)");
}
