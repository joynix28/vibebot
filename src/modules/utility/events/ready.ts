import { Events } from "discord.js";
import type { Client } from "discord.js";
import { startRappelScheduler } from "../func/rappel.ts";

// Au démarrage : (re)lance le balayage des rappels persistés en base.
// Les rappels manqués pendant un arrêt sont envoyés dès le boot.

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  startRappelScheduler(client);
  console.log("[utility] scheduler de rappels démarré");
}
