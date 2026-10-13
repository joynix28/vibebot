import type { Guild, GuildChannel, Role } from "discord.js";
import { get, clChg } from "../../func/db.ts";

// Logique partagée du suivi des changements serveur.
// NOTE : le loader de fusion n'enregistre qu'un couple name/execute par fichier,
// donc chaque événement est exposé via un petit fichier changeTrack*.ts qui
// réexporte ces handlers (l'export tableau `events` de la source serait ignoré).

export function tracking(guildId: string): boolean {
  return !!get(guildId)?.xp_keep_roles;
}

export async function onChannelCreate(channel: GuildChannel): Promise<void> {
  if (!tracking(channel.guildId)) return;
  clChg(channel.guildId, "channel", `Channel **#${channel.name}** created`);
}

export async function onChannelDelete(channel: GuildChannel): Promise<void> {
  if (!tracking(channel.guildId)) return;
  clChg(channel.guildId, "channel", `Channel **#${channel.name}** deleted`);
}

export async function onChannelUpdate(oldC: GuildChannel, newC: GuildChannel): Promise<void> {
  if (!tracking(newC.guildId)) return;
  if (oldC.name !== newC.name) {
    clChg(newC.guildId, "channel", `Channel **#${oldC.name}** renamed to **#${newC.name}**`);
  }
}

export async function onRoleCreate(role: Role): Promise<void> {
  if (!tracking(role.guild.id)) return;
  clChg(role.guild.id, "role", `Role **@${role.name}** created`);
}

export async function onRoleDelete(role: Role): Promise<void> {
  if (!tracking(role.guild.id)) return;
  clChg(role.guild.id, "role", `Role **@${role.name}** deleted`);
}

export async function onRoleUpdate(oldR: Role, newR: Role): Promise<void> {
  if (!tracking(newR.guild.id)) return;
  if (oldR.name !== newR.name) {
    clChg(newR.guild.id, "role", `Role **@${oldR.name}** renamed to **@${newR.name}**`);
  }
}

export async function onGuildUpdate(oldG: Guild, newG: Guild): Promise<void> {
  if (!tracking(newG.id)) return;
  if (oldG.name !== newG.name) {
    clChg(newG.id, "guild", `Server **${oldG.name}** renamed to **${newG.name}**`);
  }
}
