import { Events } from "discord.js";
import type { GuildMember } from "discord.js";
import { getProtectConfig, isAntiraidExempt } from "../../func/db.ts";
import { applySanction } from "../../func/antiraid/punish.ts";
import { enableRaidmode, trackJoin } from "../../func/antiraid/raidmode.ts";

export const name = Events.GuildMemberAdd;

export async function execute(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const botId = guild.client.user?.id ?? "";
  const exempt = isAntiraidExempt(guild.id, guild.ownerId, botId, member.id);

  // Mode raid automatique : trop d'arrivées en 10 s → on verrouille
  if (!member.user.bot && trackJoin(guild.id)) {
    await enableRaidmode(guild, "arrivées massives");
  }
  const cfg = getProtectConfig(guild.id);

  // Mode raid : les nouveaux membres non exemptés sont sanctionnés
  if (cfg.raidmode && !exempt) {
    await member.send(`☢️ Le serveur ${guild.name} est en mode raid ! Réessayez ultérieurement.`).catch(() => {});
    await applySanction(member, cfg.antiraid.punish, cfg).catch(() => {});
    return;
  }

  // Anti-bot : un bot ajouté par un non-exempté est sanctionné
  if (member.user.bot && cfg.antiraid.bots && !exempt) {
    await applySanction(member, cfg.antiraid.punish, cfg).catch(() => {});
    return;
  }
  if (member.user.bot) return;

  // Rôles de bienvenue
  if (cfg.welcome.roles.enabled) {
    for (const roleId of cfg.welcome.roles.roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role || role.managed) continue;
      await member.roles.add(role, "Rôle de bienvenue").catch(() => {});
    }
  }

  // Ghost-ping de bienvenue : mentionne le membre puis supprime le message
  if (cfg.welcome.ghostping.enabled) {
    for (const channelId of cfg.welcome.ghostping.channels) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel?.isTextBased()) continue;
      const msg = await channel.send(`${member}`).catch(() => null);
      if (msg) await msg.delete().catch(() => {});
    }
  }
}
