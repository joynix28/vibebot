import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, ACCENT, errPanel, FLAGS_V2_EPHEMERAL } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Affiche les informations d'un membre du serveur.")
  .addUserOption((o) => o.setName("membre").setDescription("Le membre à inspecter (toi par défaut)."));

const BADGES: Record<string, string> = {
  Staff: "🛡️",
  Partner: "🤝",
  HypeSquad: "🎉",
  BugHunterLevel1: "🐛",
  BugHunterLevel2: "🐛",
  HypeSquadOnlineHouse1: "🟣",
  HypeSquadOnlineHouse2: "🟢",
  HypeSquadOnlineHouse3: "🟠",
  PremiumEarlySupporter: "💎",
  Premium: "💠",
  VerifiedDeveloper: "⚙️",
  ActiveDeveloper: "🧑‍💻",
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const user = interaction.options.getUser("membre") ?? interaction.user;
  const member = await guild.members.fetch(user.id).catch(() => null);

  const created = Math.floor(user.createdTimestamp / 1000);
  const badges = user.flags?.toArray().map((f) => BADGES[f] ?? f) ?? [];
  const accent = member?.displayHexColor && member.displayHexColor !== "#000000"
    ? parseInt(member.displayHexColor.slice(1), 16)
    : ACCENT;

  const header = `## 👤 ${user.tag}\n${user} — \`${user.id}\``;
  const badgesLine = badges.length > 0 ? `\n🏅 ${badges.join(" ")}` : "";

  const container = new ContainerBuilder().setAccentColor(accent);
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(header + badgesLine)
  );
  section.setThumbnailAccessory(
    new ThumbnailBuilder().setURL(user.displayAvatarURL({ size: 256 })).setDescription(`Avatar de ${user.tag}`)
  );
  container.addSectionComponents(section);

  const lines: string[] = [
    `> **Compte créé :** <t:${created}:F> (<t:${created}:R>)`,
    member
      ? `> **A rejoint :** <t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:F> (<t:${Math.floor((member.joinedTimestamp ?? Date.now()) / 1000)}:R>)`
      : "> **A rejoint :** *pas sur ce serveur*",
  ];
  if (member) {
    const roles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position);
    lines.push(`> **Rôles (${roles.size}) :** ${roles.size > 0 ? roles.first(10).map((r) => `${r}`).join(" ") + (roles.size > 10 ? ` *+${roles.size - 10}*` : "") : "*aucun*"}`);
    lines.push(`> **Pseudo :** ${member.nickname ? `\`${member.nickname}\`` : "*aucun*"}`);
    lines.push(`> **Boost :** ${member.premiumSinceTimestamp ? `oui (depuis <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>)` : "non"}`);
    if (member.isCommunicationDisabled()) lines.push(`> **Timeout :** jusqu'à <t:${Math.floor(member.communicationDisabledUntilTimestamp! / 1000)}:R>`);
  }
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join("\n")));

  await interaction.reply({ components: [container], flags: FLAGS_V2 });
}
