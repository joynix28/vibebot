import { EmbedBuilder, Events } from "discord.js";
import type { Guild } from "discord.js";
import { COLORS, enqueueLogEmbed } from "../../func/logger.ts";

export const name = Events.GuildUpdate;

function describeChange(label: string, oldValue: string | null, newValue: string | null): string | null {
  if (oldValue === newValue) return null;
  return `**${label} :** ${oldValue ?? "*aucun*"} → ${newValue ?? "*aucun*"}`;
}

export async function execute(oldGuild: Guild, newGuild: Guild): Promise<void> {
  const changes: string[] = [];
  const candidates = [
    describeChange("Nom", oldGuild.name, newGuild.name),
    describeChange("Description", oldGuild.description, newGuild.description),
    describeChange("Icône", oldGuild.iconURL(), newGuild.iconURL()),
    describeChange("Bannière", oldGuild.bannerURL(), newGuild.bannerURL()),
    describeChange("Propriétaire", oldGuild.ownerId, newGuild.ownerId),
  ];
  for (const c of candidates) if (c) changes.push(c);
  if (!changes.length) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle("Paramètres du serveur modifiés")
    .setDescription(changes.join("\n"))
    .setFooter({ text: `ID du serveur : ${newGuild.id}` })
    .setTimestamp();

  enqueueLogEmbed(newGuild, "server", embed);
}
