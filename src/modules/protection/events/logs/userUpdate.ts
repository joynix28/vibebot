import { EmbedBuilder, Events } from "discord.js";
import type { PartialUser, User } from "discord.js";
import { COLORS, enqueueLogEmbed, memberAuthorLine } from "../../func/logger.ts";
import { getProtectConfig } from "../../func/db.ts";

export const name = Events.UserUpdate;

/**
 * Logue les changements de pseudo / avatar d'un utilisateur dans les serveurs
 * où il est membre et où le salon de logs "members" est configuré.
 */
export async function execute(oldUser: User | PartialUser, newUser: User): Promise<void> {
  if (newUser.bot) return;

  // oldUser est souvent partiel : on compare uniquement ce qui est disponible.
  const prev = oldUser as Partial<User>;
  const changes: string[] = [];
  if (prev.username != null && prev.username !== newUser.username) {
    changes.push(`**Pseudo :** \`${prev.username}\` → \`${newUser.username}\``);
  }
  if (prev.avatar !== undefined && prev.avatar !== newUser.avatar) {
    changes.push("**Avatar :** modifié");
  }
  if (!changes.length) return;

  for (const guild of newUser.client.guilds.cache.values()) {
    if (!guild.members.cache.has(newUser.id)) continue;
    if (!getProtectConfig(guild.id).logs.members) continue;

    const embed = new EmbedBuilder()
      .setColor(COLORS.warning)
      .setAuthor({
        name: memberAuthorLine(newUser),
        iconURL: newUser.displayAvatarURL({ size: 64 }),
      })
      .setTitle("Profil mis à jour")
      .setDescription(`${newUser} a modifié son profil.`)
      .addFields({ name: "Changements :", value: changes.join("\n") })
      .setThumbnail(newUser.displayAvatarURL({ size: 256 }))
      .setFooter({ text: `ID de l'utilisateur : ${newUser.id}` })
      .setTimestamp();

    enqueueLogEmbed(guild, "members", embed);
  }
}
