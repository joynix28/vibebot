import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, msgPanel, okPanel, panel, textBlock } from "../../../core/ui.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  formatDuration,
  isOwnerOrWhitelisted,
  logMod,
  needGuild,
  parseCancel,
  parseConfirm,
  replyErr,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("prune")
  .setDescription("Expulser les membres ayant rejoint le serveur récemment.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("delai").setDescription("Délai (ex : 30m, 2h, 12h, 1d — entre 5 min et 1 jour).").setRequired(true)
  )
  .addRoleOption((o) => o.setName("role").setDescription("Limiter aux membres ayant ce rôle."));

const CMD = "prune";
const MIN_MS = 5 * 60_000;
const MAX_MS = 86_400_000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const raw = interaction.options.getString("delai", true);
  const m = raw.trim().toLowerCase().match(/^(\d+)([smhd])$/);
  if (!m || !m[1] || !m[2]) {
    await replyErr(interaction, "❌ Délai invalide. Exemples : `30m`, `2h`, `12h`, `1d`.");
    return;
  }
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = parseInt(m[1], 10) * (mult[m[2]] ?? 0);
  if (ms < MIN_MS || ms > MAX_MS) {
    await replyErr(interaction, "❌ Le délai doit être compris entre 5 minutes et 1 jour.");
    return;
  }
  const role = interaction.options.getRole("role");
  const members = guild.members.cache.filter(
    (mb) =>
      mb.joinedTimestamp !== null &&
      Date.now() - mb.joinedTimestamp < ms &&
      mb.kickable &&
      (!role || mb.roles.cache.has(role.id))
  );
  if (!members.size) {
    await interaction.reply({
      components: [msgPanel(`ℹ️ Aucun membre expulsable n'a rejoint il y a moins de ${formatDuration(ms)}.`, BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  const extra = role ? `${ms}:${role.id}` : `${ms}`;
  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `# 🧹 Prune\nExpulser **${members.size} membre${members.size > 1 ? "s" : ""}** ayant rejoint il y a moins de **${formatDuration(ms)}**${role ? ` avec le rôle ${role}` : ""} ?`
          ),
        ],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, extra),
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

  const ms = Number(info.extra[0]);
  const roleId = info.extra[1];
  if (!Number.isFinite(ms)) {
    await replyErr(interaction, "❌ Paramètres de confirmation invalides.");
    return;
  }
  const members = guild.members.cache.filter(
    (mb) =>
      mb.joinedTimestamp !== null &&
      Date.now() - mb.joinedTimestamp < ms &&
      mb.kickable &&
      (!roleId || mb.roles.cache.has(roleId))
  );
  await interaction.update({ components: [] });
  await interaction.followUp({
    components: [msgPanel(`ℹ️ Expulsion de **${members.size}** membre(s) en cours...`, BLURPLE)],
    flags: FLAGS_V2,
  });

  let count = 0;
  for (const member of members.values()) {
    try {
      await member.kick(`Prune demandé par @${interaction.user.username}`);
      count++;
    } catch {
      // ignore
    }
  }
  await interaction.followUp({
    components: [okPanel(`✅ **${count}** membre${count > 1 ? "s" : ""} expulsé${count > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🧹 **Prune** — ${count} membre(s) expulsé(s) (rejoint(s) il y a moins de ${formatDuration(ms)}) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
