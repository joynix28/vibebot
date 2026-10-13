import { Events } from "discord.js";
import type { Client } from "discord.js";
import { refreshServerStats } from "../func/serverstats.ts";

// Actualisation périodique des compteurs serverstats (toutes les 10 minutes),
// en complément des mises à jour sur arrivée/départ de membres.

export const name = Events.ClientReady;
export const once = true;

const REFRESH_MS = 10 * 60 * 1000;

export async function execute(client: Client): Promise<void> {
  const sweep = () => {
    for (const guild of client.guilds.cache.values()) {
      void refreshServerStats(guild).catch((err) =>
        console.error("[legacy] erreur actualisation serverstats", err)
      );
    }
  };
  // Première passe différée pour laisser le cache se remplir.
  setTimeout(sweep, 60_000);
  setInterval(sweep, REFRESH_MS);
}
