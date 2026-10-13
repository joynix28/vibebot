import type { ChatInputCommandInteraction } from "discord.js";
import { permLvl } from "./db.ts";

// lvl: "all" = admins can use everything
//      "safe" = admins can create but not destructive (default)
//      "owner" = only the server owner
// destructive = loading backups/templates, pasting clipboard
export function canUse(interaction: ChatInputCommandInteraction, destructive: boolean): boolean {
  const guild = interaction.guild;
  if (!guild) return false;
  if (interaction.user.id === guild.ownerId) return true;

  const lvl = permLvl(guild.id);
  if (lvl === "owner") return false;
  if (lvl === "safe" && destructive) return false;

  const member = interaction.member;
  const perms = (member as any)?.permissions;
  return perms?.has?.("Administrator") ?? false;
}
