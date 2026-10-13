import type { Guild, Invite } from "discord.js";

// Cache des utilisations d'invitations par serveur, repris du bot legacy
// (Events/Invitations/invitesInviteCache.js). Permet de détecter quelle
// invitation a été utilisée lors d'une arrivée (guildMemberAdd).

const cache = new Map<string, Map<string, number>>();

/** (Re)construit le cache des utilisations pour un serveur. */
export async function refreshInviteCache(guild: Guild): Promise<void> {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map<string, number>();
    for (const inv of invites.values()) {
      map.set(inv.code, inv.uses ?? 0);
    }
    cache.set(guild.id, map);
  } catch {
    // permissions insuffisantes : le tracking sera indisponible
  }
}

/**
 * Compare le cache avec l'état actuel et retourne l'invitation dont le
 * compteur a augmenté (celle utilisée pour la dernière arrivée), puis
 * met le cache à jour. Retourne null si indétectable.
 */
export async function detectUsedInvite(guild: Guild): Promise<Invite | null> {
  const old = cache.get(guild.id) ?? new Map<string, number>();
  let used: Invite | null = null;
  try {
    const invites = await guild.invites.fetch();
    const next = new Map<string, number>();
    for (const inv of invites.values()) {
      const uses = inv.uses ?? 0;
      const prev = old.has(inv.code) ? old.get(inv.code)! : 0;
      next.set(inv.code, uses);
      if (!used && uses > prev) used = inv;
    }
    cache.set(guild.id, next);
  } catch {
    return null;
  }
  return used;
}

/** Oublie le cache d'un serveur (au départ du bot / suppression). */
export function dropInviteCache(guildId: string): void {
  cache.delete(guildId);
}
