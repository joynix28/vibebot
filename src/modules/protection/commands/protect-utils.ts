import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  msgPanel,
  okPanel,
  panel,
  textBlock,
} from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("protect-utils")
  .setDescription("Utilitaires du serveur : badges, tag, boosts.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName("badges").setDescription("Lister les membres possédant des badges Discord."))
  .addSubcommand((s) =>
    s
      .setName("tag")
      .setDescription("Attribuer ou retirer un rôle aux membres portant le tag du serveur.")
      .addStringOption((o) =>
        o
          .setName("action")
          .setDescription("Action à effectuer.")
          .setRequired(true)
          .addChoices({ name: "Ajouter", value: "add" }, { name: "Retirer", value: "remove" })
      )
      .addRoleOption((o) => o.setName("role").setDescription("Rôle à attribuer/retirer.").setRequired(true))
  )
  .addSubcommand((s) => s.setName("boost").setDescription("Afficher les informations sur les boosts du serveur."));

const FLAG_LABELS: Record<string, string> = {
  Staff: "Employé Discord",
  Partner: "Partenaire Discord",
  Hypesquad: "HypeSquad Events",
  BugHunterLevel1: "Bug Hunter (niveau 1)",
  BugHunterLevel2: "Bug Hunter (niveau 2)",
  HypeSquadOnlineHouse1: "Bravery",
  HypeSquadOnlineHouse2: "Brilliance",
  HypeSquadOnlineHouse3: "Balance",
  PremiumEarlySupporter: "Early Supporter",
  VerifiedDeveloper: "Développeur vérifié",
  CertifiedModerator: "Modérateur certifié",
  ActiveDeveloper: "Développeur actif",
};

async function badgesCmd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const byFlag = new Map<string, string[]>();
  for (const member of members.values()) {
    const flags = member.user.flags?.toArray() ?? [];
    for (const flag of flags) {
      const label = FLAG_LABELS[flag];
      if (!label) continue;
      const list = byFlag.get(label) ?? [];
      if (list.length < 15) list.push(`<@${member.id}>`);
      byFlag.set(label, list);
    }
  }
  if (!byFlag.size) {
    await interaction.editReply({
      components: [msgPanel("ℹ️ Aucun membre avec un badge Discord reconnu.", BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = [...byFlag.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, ids]) => `🏅 **${label}** (${ids.length}) : ${ids.join(", ")}`);
  const content = `# 🏅 Badges Discord\n${lines.join("\n")}`.slice(0, 3900);
  await interaction.editReply({ components: [panel([textBlock(content)], BLURPLE)], flags: FLAGS_V2 });
}

async function tagCmd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const action = interaction.options.getString("action", true);
  const roleOpt = interaction.options.getRole("role", true);
  const role = guild.roles.cache.get(roleOpt.id) ?? (await guild.roles.fetch(roleOpt.id).catch(() => null));
  if (!role) {
    await replyErr(interaction, "❌ Rôle introuvable.");
    return;
  }
  if (role.managed) {
    await replyErr(interaction, `❌ Le rôle ${role} est un rôle d'intégration, il ne peut pas être attribué.`);
    return;
  }
  const me = guild.members.me;
  if (!me || me.roles.highest.position <= role.position) {
    await replyErr(interaction, `❌ Je ne peux pas gérer le rôle ${role} (hiérarchie).`);
    return;
  }
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const tagged = members.filter((m) => m.user.primaryGuild?.identityGuildId === guild.id && !m.user.bot);
  let count = 0;
  for (const member of tagged.values()) {
    try {
      if (action === "add" && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, `Rôle tag demandé par @${interaction.user.username}`);
        count++;
      } else if (action === "remove" && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `Rôle tag demandé par @${interaction.user.username}`);
        count++;
      }
    } catch {
      // ignore les échecs individuels (hiérarchie, etc.)
    }
  }
  const verb = action === "add" ? "attribué" : "retiré";
  await interaction.editReply({
    components: [okPanel(`✅ Rôle ${role} ${verb} à **${count}** membre${count > 1 ? "s" : ""} portant le tag du serveur.`)],
    flags: FLAGS_V2,
  });
}

async function boostCmd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const boosters = guild.members.cache.filter((m) => m.premiumSince);
  const names = boosters.first(20).map((m) => `<@${m.id}>`);
  const content = [
    "# 💎 Boosts du serveur",
    `**Niveau :** ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
    `**Boosters :** ${boosters.size}`,
    names.length ? names.join(", ") : "*Aucun booster*",
  ].join("\n");
  await interaction.reply({ components: [panel([textBlock(content)], BLURPLE)], flags: FLAGS_V2 });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const sub = interaction.options.getSubcommand();
  if (sub === "badges") {
    await badgesCmd(interaction);
  } else if (sub === "tag") {
    await tagCmd(interaction);
  } else {
    await boostCmd(interaction);
  }
}
