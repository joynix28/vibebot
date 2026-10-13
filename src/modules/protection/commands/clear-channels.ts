import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, okPanel, panel, textBlock } from "../../../core/ui.ts";
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
  .setName("clear-channels")
  .setDescription("Supprimer tous les salons portant le même nom qu'un salon donné.")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption((o) =>
    o.setName("salon").setDescription("Salon dont le nom servira de filtre.").setRequired(true)
  );

const CMD = "clear-channels";

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const channel = interaction.options.getChannel("salon", true);
  const targets = guild.channels.cache.filter((c) => c.name === channel.name);
  if (!targets.size) {
    await replyErr(interaction, "❌ Aucun salon trouvé avec ce nom.");
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [textBlock(`# 🗑️ Clear channels\nSupprimer **${targets.size} salon${targets.size > 1 ? "s" : ""}** nommé \`${channel.name}\` ?\n⚠️ *Action irréversible.*`)],
        BLURPLE
      ),
      confirmRow(CMD, interaction.user.id, channel.id),
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

  const ref = info.extra[0] ? guild.channels.cache.get(info.extra[0]) : null;
  const name = ref?.name;
  if (!name) {
    await replyErr(interaction, "❌ Salon de référence introuvable.");
    return;
  }
  const targets = guild.channels.cache.filter((c) => c.name === name);
  await interaction.update({ components: [] });

  let count = 0;
  for (const c of targets.values()) {
    try {
      await c.delete(`Clear-channels demandé par @${interaction.user.username}`);
      count++;
    } catch {
      // ignore
    }
  }
  try {
    await interaction.followUp({
      components: [okPanel(`✅ **${count}** salon${count > 1 ? "s" : ""} supprimé${count > 1 ? "s" : ""}.`)],
      flags: FLAGS_V2,
    });
  } catch {
    // Le salon de la commande a peut-être été supprimé.
  }
  await logMod(guild, `🗑️ **Clear-channels** — ${count} salon(s) nommé(s) \`${name}\` supprimé(s) par ${interaction.user} (\`${interaction.user.id}\`).`);
}
