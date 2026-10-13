import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, actionRow, field, linkBtn, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("user-info")
  .setDescription("Afficher les informations sur un utilisateur.")
  .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur à inspecter (défaut : vous)."));

const FLAG_LABELS: Record<string, string> = {
  Staff: "Employé Discord",
  Partner: "Partenaire Discord",
  Hypesquad: "HypeSquad",
  BugHunterLevel1: "Bug Hunter",
  BugHunterLevel2: "Bug Hunter (or)",
  HypeSquadOnlineHouse1: "Bravery",
  HypeSquadOnlineHouse2: "Brilliance",
  HypeSquadOnlineHouse3: "Balance",
  PremiumEarlySupporter: "Early Supporter",
  VerifiedDeveloper: "Dév. vérifié",
  CertifiedModerator: "Modo certifié",
  ActiveDeveloper: "Dév. actif",
};

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}> (<t:${s}:R>)`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const user = interaction.options.getUser("utilisateur") ?? interaction.user;
  const member = await guild.members.fetch(user.id).catch(() => null);
  const full = await interaction.client.users.fetch(user.id, { force: true }).catch(() => null);

  const badges = (full?.flags?.toArray() ?? [])
    .filter((f) => f !== "VerifiedBot")
    .map((f) => FLAG_LABELS[f] ?? f);
  const rolesLine = member
    ? member.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(10)
        .map((r) => `${r}`)
        .join(" ") || "*Aucun rôle*"
    : null;

  const blocks = [
    textBlock(`# 👤 ${user.globalName ?? user.username}`),
    sepBlock(),
    textBlock(
      [
        field("ID", user.id),
        `> **Nom :** ${user} \`@${user.username}\``,
        field("Compte créé le", ts(user.createdTimestamp)),
        `> **Bot :** ${user.bot ? "✅ Oui" : "❌ Non"}`,
        badges.length ? `> **Badges :** ${badges.join(", ")}` : "> **Badges :** *aucun*",
      ].join("\n")
    ),
  ];
  if (member && member.joinedTimestamp) {
    blocks.push(sepBlock());
    blocks.push(
      textBlock(
        [
          field("A rejoint le", ts(member.joinedTimestamp)),
          `> **Pseudo :** ${member.nickname ?? "*aucun*"}`,
          `> **Rôles (${member.roles.cache.size - 1}) :** ${rolesLine}`,
          member.premiumSince ? `> **Booste depuis :** ${ts(member.premiumSinceTimestamp ?? Date.now())}` : "> **Boost :** non",
        ].join("\n")
      )
    );
  }

  const rows = [];
  const avatar = user.displayAvatarURL({ size: 256 });
  const banner = full?.bannerURL({ size: 1024 });
  if (avatar || banner) {
    const links = actionRow();
    if (avatar) links.addComponents(linkBtn(avatar, "Avatar"));
    if (banner) links.addComponents(linkBtn(banner, "Bannière"));
    rows.push(links);
  }

  await interaction.reply({ components: [panel(blocks, BLURPLE), ...rows], flags: FLAGS_V2 });
}
