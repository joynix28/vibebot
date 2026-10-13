import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { getProtectConfig } from "../../func/db.ts";

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  // Initialise la config de protection du serveur.
  // (Le message de bienvenue unique est envoyé par le core.)
  getProtectConfig(guild.id);
}
