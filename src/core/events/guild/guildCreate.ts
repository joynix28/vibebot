import { Events } from "discord.js";
import type { Guild } from "discord.js";
import { loadModuleMetas } from "../../loader.ts";
import { panel, textBlock, sepBlock, FLAGS_V2, BLUE } from "../../ui.ts";

// Message de bienvenue unique quand le bot rejoint un serveur.

export const name = Events.GuildCreate;

export async function execute(guild: Guild): Promise<void> {
  const system = guild.systemChannel;
  if (!system?.isTextBased()) return;

  const metas = await loadModuleMetas().catch(() => []);
  const baseUrl = guild.client.config.baseUrl;

  const lines = metas.map((m) => `${m.emoji} **${m.name}** — ${m.description}`);

  const body =
    `# Merci d'avoir ajouté Fusion Bot !\n\n` +
    `Un seul bot pour tout ton serveur :\n\n` +
    lines.map((l) => `> ${l}`).join("\n") +
    `\n\n**Pour commencer**\n` +
    `> Tape \`/help\` pour voir toutes les commandes.\n` +
    `> Ouvre le [dashboard](${baseUrl}/dashboard) pour tout configurer facilement.\n` +
    `> Donne au bot le **rôle le plus haut** possible pour qu'il puisse appliquer les sanctions.`;

  await system
    .send({ components: [panel([textBlock(body), sepBlock(false)])], flags: FLAGS_V2 })
    .catch(() => {});
}
