import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, TextChannel } from "discord.js";
import { FLAGS_V2, msgPanel, okPanel, panel, textBlock } from "../../../core/ui.ts";
import {
  BLURPLE,
  checkAuthor,
  checkFresh,
  confirmRow,
  hasPerm,
  logMod,
  needGuild,
  parseCancel,
  parseConfirm,
  replyErr,
} from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("clear-user")
  .setDescription("Supprimer les messages récents d'un utilisateur (dernière heure, tous les salons).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addUserOption((o) =>
    o.setName("utilisateur").setDescription("Utilisateur dont les messages seront supprimés.").setRequired(true)
  );

const CMD = "clear-user";
const WINDOW_MS = 60 * 60_000;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.ManageMessages) || !hasPerm(interaction, PermissionFlagsBits.ModerateMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin des permissions **Gérer les messages** et **Exclure des membres**.");
    return;
  }
  const user = interaction.options.getUser("utilisateur", true);
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🧹 Clear user\nSupprimer tous les messages de ${user} envoyés dans la **dernière heure** (tous les salons) ?`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, user.id),
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

  const userId = info.extra[0];
  if (!userId) {
    await replyErr(interaction, "❌ Paramètres de confirmation invalides.");
    return;
  }
  const user = await interaction.client.users.fetch(userId).catch(() => null);
  await interaction.update({ components: [] });
  await interaction.followUp({
    components: [msgPanel(`ℹ️ Suppression des messages de ${user ?? `\`${userId}\``} en cours...`, BLURPLE)],
    flags: FLAGS_V2,
  });

  const me = guild.members.me;
  const cutoff = Date.now() - WINDOW_MS;
  const channels = guild.channels.cache.filter(
    (c): c is TextChannel =>
      c.isTextBased() &&
      !c.isThread() &&
      c.viewable &&
      !!me?.permissionsIn(c as TextChannel).has(PermissionFlagsBits.ManageMessages)
  );

  let deleted = 0;
  for (const channel of channels.values()) {
    try {
      let lastId: string | undefined;
      let cont = true;
      while (cont) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (!batch.size) break;
        const oldest = batch.last();
        if (!oldest) break;
        if (oldest.createdTimestamp < cutoff) cont = false;
        lastId = oldest.id;
        const targets = batch.filter((m) => m.author.id === userId && m.createdTimestamp > cutoff);
        for (const msg of targets.values()) {
          try {
            await msg.delete();
            deleted++;
            await new Promise((r) => setTimeout(r, 300));
          } catch {
            // ignore
          }
        }
        if (batch.size < 100) break;
      }
    } catch {
      // salon inaccessible : on passe au suivant
    }
  }

  await interaction.followUp({
    components: [okPanel(`✅ **${deleted}** message${deleted > 1 ? "s" : ""} supprimé${deleted > 1 ? "s" : ""}.`)],
    flags: FLAGS_V2,
  });
  await logMod(guild, `🧹 **Clear-user** — ${deleted} message(s) de ${user ?? `\`${userId}\``} supprimé(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
