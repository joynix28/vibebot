import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, msgPanel, okPanel, panel, textBlock } from "../../../core/ui.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  isOwnerOrWhitelisted,
  logMod,
  needGuild,
  parseCancel,
  parseConfirm,
  replyErr,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("role-all")
  .setDescription("Attribuer un rôle à tous les membres du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption((o) => o.setName("role").setDescription("Rôle à attribuer.").setRequired(true))
  .addStringOption((o) =>
    o
      .setName("cible")
      .setDescription("Membres concernés.")
      .setRequired(true)
      .addChoices(
        { name: "Humains uniquement", value: "humains" },
        { name: "Robots uniquement", value: "robots" },
        { name: "Tous les membres", value: "tous" }
      )
  );

const CMD = "role-all";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const roleOpt = interaction.options.getRole("role", true);
  const role = guild.roles.cache.get(roleOpt.id);
  if (!role) {
    await replyErr(interaction, "❌ Rôle introuvable.");
    return;
  }
  const cible = interaction.options.getString("cible", true);
  if (role.managed) {
    await replyErr(interaction, `❌ Le rôle ${role} est un rôle d'intégration.`);
    return;
  }
  const me = guild.members.me;
  if (!me || me.roles.highest.position <= role.position || !role.editable) {
    await replyErr(interaction, `❌ Je ne peux pas attribuer le rôle ${role} (hiérarchie).`);
    return;
  }
  const cibleLabel = cible === "humains" ? "humains" : cible === "robots" ? "robots" : "membres";
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🎭 Role-all\nAttribuer le rôle ${role} à tous les **${cibleLabel}** du serveur (${guild.memberCount} membres) ?`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, `${role.id}:${cible}`),
    ],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const cancelAuthor = parseCancel(interaction.customId, CMD);
  if (cancelAuthor) {
    if (!(await checkAuthor(interaction, cancelAuthor))) return;
    await interaction.update({ components: [] });
    return;
  }

  const info = parseConfirm(interaction.customId, CMD);
  if (!info) return;
  if (!(await checkAuthor(interaction, info.authorId))) return;
  if (!(await checkFresh(interaction, info.ts))) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }

  const [roleId, cible] = info.extra;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!role || role.managed || !role.editable) {
    await replyErr(interaction, "❌ Rôle introuvable ou non attribuable.");
    return;
  }

  await interaction.deferUpdate();
  await interaction.followUp({
    components: [msgPanel("ℹ️ Attribution du rôle en cours...", BLURPLE)],
    flags: FLAGS_V2_EPHEMERAL,
  });

  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const targets = members.filter((m) =>
    cible === "humains" ? !m.user.bot : cible === "robots" ? m.user.bot : true
  );
  let count = 0;
  for (const member of targets.values()) {
    try {
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, `Role-all demandé par @${interaction.user.username}`);
        count++;
      }
    } catch {
      // ignore
    }
  }
  await interaction.followUp({
    components: [okPanel(`✅ Le rôle ${role} a été attribué à **${count}** membre${count > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🎭 **Role-all** — rôle ${role} (\`${role.id}\`) attribué à ${count} membre(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
