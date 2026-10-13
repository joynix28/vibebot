import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { g } from "../../func/db.ts";

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  // Initialise la config backup du serveur.
  // (Le message de bienvenue unique est envoyé par le core.)
  g(guild.id);
}
