import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { ensureGuild } from "../../func/db.ts";

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  // Initialise la ligne du serveur en base.
  // (Le message de bienvenue unique est envoyé par le core.)
  ensureGuild(guild.id);
}
