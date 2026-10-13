import { Events } from "discord.js";
import type { Client } from "discord.js";
import { listExpiredPolls } from "../func/db-gestion.ts";
import { closeExpiredPoll } from "../commands/poll.ts";
import { refreshAllCounters } from "../commands/counter.ts";
import { listGuildsWithBirthdays, announceTodaysBirthdays } from "../commands/birthday.ts";

// Scheduler "Gestion", démarré une seule fois au ClientReady (cohabite avec le
// scheduler de l'autre agent, qui gère giveaways + cache invitations).
// - Compteurs de salons : toutes les 10 minutes.
// - Clôture des sondages expirés : toutes les minutes.
// - Annonces d'anniversaires : toutes les heures.

export const name = Events.ClientReady;
export const once = true;

const COUNTERS_MS = 10 * 60 * 1000;
const POLLS_MS = 60 * 1000;
const BIRTHDAYS_MS = 60 * 60 * 1000;

async function tickCounters(client: Client): Promise<void> {
  try {
    await refreshAllCounters(client);
  } catch (err) {
    console.error("[legacy] erreur rafraîchissement compteurs", err);
  }
}

async function tickPolls(client: Client): Promise<void> {
  try {
    for (const poll of listExpiredPolls(Date.now())) {
      const guild = await client.guilds.fetch(poll.guild_id).catch(() => null);
      if (!guild) continue;
      await closeExpiredPoll(guild, poll).catch((err) => {
        console.error(`[legacy] échec clôture sondage #${poll.id}`, err);
      });
    }
  } catch (err) {
    console.error("[legacy] erreur clôture sondages", err);
  }
}

async function tickBirthdays(client: Client): Promise<void> {
  try {
    for (const guildId of listGuildsWithBirthdays()) {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) continue;
      await announceTodaysBirthdays(guild).catch((err) => {
        console.error(`[legacy] échec annonce anniversaires (${guildId})`, err);
      });
    }
  } catch (err) {
    console.error("[legacy] erreur anniversaires", err);
  }
}

export async function execute(client: Client): Promise<void> {
  // Première passe peu après le démarrage, puis intervalles réguliers.
  setTimeout(() => {
    void tickCounters(client);
    void tickPolls(client);
    void tickBirthdays(client);
  }, 10_000);
  setInterval(() => void tickCounters(client), COUNTERS_MS);
  setInterval(() => void tickPolls(client), POLLS_MS);
  setInterval(() => void tickBirthdays(client), BIRTHDAYS_MS);
  console.log("[legacy] scheduler gestion démarré (compteurs, sondages, anniversaires)");
}
