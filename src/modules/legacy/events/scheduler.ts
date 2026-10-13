import { Events } from "discord.js";
import type { Client } from "discord.js";
import { dueGiveaways } from "../func/db.ts";
import { finishGiveaway } from "../func/giveaway.ts";
import { refreshInviteCache } from "../func/inviteCache.ts";

// Démarré une seule fois au ClientReady : initialise le cache des invitations
// (utilisé pour détecter l'inviteur à l'arrivée d'un membre) et lance
// l'intervalle qui tire les giveaways arrivés à échéance.

export const name = Events.ClientReady;
export const once = true;

const CHECK_INTERVAL_MS = 30_000;

export async function execute(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await refreshInviteCache(guild).catch(() => {});
  }

  const check = async () => {
    try {
      const due = dueGiveaways(Date.now());
      for (const gw of due) {
        await finishGiveaway(client, gw).catch((err) => {
          console.error(`[legacy] échec du tirage du giveaway #${gw.id}`, err);
        });
      }
    } catch (err) {
      console.error("[legacy] erreur du scheduler giveaway", err);
    }
  };

  await check();
  setInterval(() => void check(), CHECK_INTERVAL_MS);
  console.log("[legacy] scheduler démarré (giveaways + cache invitations)");
}
