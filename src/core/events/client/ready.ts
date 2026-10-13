import { Events } from "discord.js";
import type { Client } from "discord.js";
import { regSlash } from "../../loader.ts";

export const name = Events.ClientReady;
export const once = true;

export async function execute(client: Client): Promise<void> {
  console.log(`[ready] Connecté en tant que ${client.user?.tag}`);
  await regSlash(client);
}
