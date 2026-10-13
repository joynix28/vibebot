import { EmbedBuilder } from "discord.js";
import type { Guild, GuildMember } from "discord.js";
import { getProtectConfig } from "../db.ts";
import type { ProtectConfig } from "../db.ts";

export type PunishMode = "ban" | "kick" | "derank" | "mute";

/** Libellés FR des raisons d'anti-raid (repris de NdProtect). */
export const REASON_LABELS: Record<string, string> = {
  "ajoute un bot": "Ajout d'un grand nombre de bots",
  "crée un webhook": "Création d'un grand nombre de webhooks",
  "banni trop de membres": "Bannissement massif de membres",
  "expulsé trop de membres": "Expulsion massive de membres",
  "débanni trop de membres": "Débannissement massif de membres",
  "crée un salon": "Création d'un grand nombre de salons",
  "supprime un salon": "Suppression d'un grand nombre de salons",
  "modifie un salon": "Modification massive de salons",
  "crée un rôle": "Création d'un grand nombre de rôles",
  "supprime un rôle": "Suppression d'un grand nombre de rôles",
  "modifie un rôle": "Modification massive de rôles",
  "modifié un rôle": "Modification massive de rôles",
  "modifié le serveur": "Modification de l'identité du serveur",
  "crée un emoji": "Création d'un grand nombre d'emojis",
  "supprime un emoji": "Suppression d'un grand nombre d'emojis",
  "modifie un emoji": "Modification massive d'emojis",
  "modifié un emoji": "Modification massive d'emojis",
  "crée un sticker": "Création d'un grand nombre de stickers",
  "supprime un sticker": "Suppression d'un grand nombre de stickers",
  "modifie un sticker": "Modification massive de stickers",
  "modifié un sticker": "Modification massive de stickers",
  "débanni un membre": "Débannissement massif de membres",
  "modifie les rôles d'un membre": "Attribution de permissions dangereuses",
  "donné un rôle dangereux à": "Attribution de permissions dangereuses",
  "déplace trop de membres": "Déplacement massif en vocal",
  "déconnecte trop de membres": "Déconnexion massive en vocal",
  "supprimé un salon": "Suppression d'un grand nombre de salons",
  "ajouté une permission sur un salon": "Modification massive des permissions de salon",
  "supprimé une permission sur un salon": "Modification massive des permissions de salon",
  "modifié les permissions d'un salon": "Modification massive des permissions de salon",
  "déplacé trop de membres entre salons vocaux": "Déplacement massif en vocal",
  "déconnecté trop de membres des salons vocaux": "Déconnexion massive en vocal",
};

export function reasonLabel(actionKey: string): string {
  const hit = REASON_LABELS[actionKey];
  if (hit) return hit;
  if (typeof actionKey !== "string") return String(actionKey);
  if (actionKey.startsWith("donné un rôle dangereux")) {
    return REASON_LABELS["donné un rôle dangereux à"] ?? actionKey;
  }
  if (actionKey.startsWith("expulsé")) return "Expulsion massive de membres";
  if (actionKey.startsWith("débanni")) return "Débannissement massif de membres";
  if (
    actionKey.includes("déplacé un salon") ||
    actionKey.includes("catégorie") ||
    actionKey.includes("permissions d'un salon") ||
    actionKey.includes("modifié un salon")
  ) {
    return "Modification massive de salons";
  }
  return actionKey;
}

/** Applique une sanction à un membre (mute = rôle configuré, sinon timeout 10 min). */
export async function applySanction(member: GuildMember, mode: PunishMode, cfg?: ProtectConfig): Promise<void> {
  const reason = "[ANTI-RAID]";
  switch (mode) {
    case "kick":
      await member.kick(reason);
      return;
    case "derank":
      await member.roles.set([], reason);
      return;
    case "mute": {
      const muteRoleId = cfg?.muteRole;
      if (muteRoleId) {
        const role = member.guild.roles.cache.get(muteRoleId);
        if (role) {
          await member.roles.add(role, reason);
          return;
        }
      }
      await member.timeout(10 * 60 * 1000, reason);
      return;
    }
    case "ban":
    default:
      await member.ban({ reason });
  }
}

/** Sanctionne selon le mode configuré (antiraid.punish) puis log dans le salon antiraid. */
export async function punish(member: GuildMember, actionKey: string): Promise<void> {
  const guild = member.guild;
  const cfg = getProtectConfig(guild.id);
  const mode = cfg.antiraid.punish;

  try {
    await applySanction(member, mode, cfg);
  } catch {
    /* ignore */
  }

  const title = mode === "kick" ? "Expulsion" : mode === "derank" ? "Derank" : mode === "mute" ? "Mute" : "Bannissement";
  const past = mode === "kick" ? "expulsé" : mode === "derank" ? "derank" : mode === "mute" ? "muté" : "banni";
  const botUser = guild.client.user;
  const modTag = botUser ? (botUser.discriminator === "0" ? `@${botUser.username}` : botUser.tag) : "bot";

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle(title)
    .setDescription(`${member.user} a été ${past} du serveur.`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: "Modérateur :", value: `> ${botUser ?? "bot"} \`${modTag}\`` },
      { name: "Raison :", value: `>>> ${`[ANTI-RAID] ${reasonLabel(actionKey)}`.slice(0, 1000)}` },
    )
    .setFooter({ text: `ID de l'utilisateur : ${member.id}` })
    .setTimestamp();

  await logAntiraid(guild, embed);
}

/** Envoie un embed dans le salon de logs antiraid configuré (protect_config.logs.antiraid). */
export async function logAntiraid(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const channelId = getProtectConfig(guild.id).logs.antiraid;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}
