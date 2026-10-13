import type { Client } from "discord.js";
import { clearTempban, dueTempbans } from "../db.ts";

const LOOP_MS = 30_000;

/** Boucle de débannissement temporaire : vérifie toutes les 30 s les unbans dus. */
export function startTempbanLoop(client: Client): void {
  const tick = async (): Promise<void> => {
    let due: Array<{ guild_id: string; user_id: string }>;
    try {
      due = dueTempbans(Date.now());
    } catch {
      return;
    }
    for (const { guild_id, user_id } of due) {
      try {
        const guild =
          client.guilds.cache.get(guild_id) ?? (await client.guilds.fetch(guild_id).catch(() => null));
        if (guild) {
          await guild.bans.remove(user_id, "Fin du bannissement temporaire").catch(() => null);
        }
      } catch {
        /* ignore */
      }
      try {
        clearTempban(guild_id, user_id);
      } catch {
        /* ignore */
      }
    }
  };

  void tick();
  setInterval(() => void tick(), LOOP_MS);
}
