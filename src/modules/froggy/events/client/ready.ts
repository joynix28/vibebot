import { Events } from "discord.js";
import type { Client } from "discord.js";
import { seed } from "../../func/emoji.ts";
import { start } from "../../func/ambient.ts";

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  try {
    // Seed des emojis applicatifs (:froge:, :froghuh:, ...), avec fallback
    // sur les emojis Unicode tant qu'ils ne sont pas synchronisés.
    await seed(client);
    // Démarre la boucle d'ambiance : un message "frog" aléatoire toutes les
    // 45 min à 6 h dans un salon piège existant.
    start(client);
  } catch (err) {
    console.error("[froggy] ready handler failed", err);
  }
}
