import type { Client } from "discord.js";
import { FLAGS_V2, panel, textBlock } from "../../../core/ui.ts";
import { listDueRappels, deleteRappel } from "./db.ts";

// Envoie les rappels arrivés à échéance dans leur salon d'origine
// (avec mention), puis les supprime. Repli en DM si le salon a disparu.

export async function deliverDueRappels(client: Client): Promise<void> {
  const due = listDueRappels(Date.now());
  for (const r of due) {
    try {
      const body = panel([textBlock(`⏰ **Rappel pour <@${r.user_id}>**\n\n> ${r.message}`)]);
      const channel = await client.channels.fetch(r.channel_id).catch(() => null);
      if (channel && channel.isTextBased() && !channel.isDMBased()) {
        await channel.send({ components: [body], flags: FLAGS_V2 });
      } else {
        const user = await client.users.fetch(r.user_id).catch(() => null);
        if (user) await user.send({ components: [body], flags: FLAGS_V2 }).catch(() => {});
      }
    } catch (err) {
      console.error("[utility] échec de l'envoi du rappel", r.id, err);
    } finally {
      deleteRappel(r.id);
    }
  }
}

/** Balayage toutes les 60 s : robuste aux redémarrages (pas de setTimeout géant). */
export function startRappelScheduler(client: Client): void {
  const tick = () => {
    void deliverDueRappels(client).catch((err) => console.error("[utility] erreur scheduler rappels", err));
  };
  void tick();
  setInterval(tick, 60_000);
}
