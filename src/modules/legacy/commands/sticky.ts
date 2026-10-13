import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { ChatInputCommandInteraction, Guild, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  okPanel,
  errPanel,
  msgPanel,
} from "../../../core/ui.ts";
import { setSticky, getSticky, removeSticky, setStickyLastId } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("sticky")
  .setDescription("Garde un message « collant » en bas du salon.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Définit le message collant du salon actuel.")
      .addStringOption((o) => o.setName("message").setDescription("Le texte du message collant.").setRequired(true).setMaxLength(1500))
  )
  .addSubcommand((s) => s.setName("remove").setDescription("Retire le message collant du salon actuel."));

/** Publie (ou republie) le sticky d'un salon et mémorise son id. */
export async function postSticky(guild: Guild, channelId: string, text: string): Promise<string | null> {
  const channel = (await guild.channels.fetch(channelId).catch(() => null)) as TextBasedChannel | null;
  if (!channel?.isSendable()) return null;
  const sent = await channel.send({ components: [msgPanel(text, BLUE)], flags: FLAGS_V2 }).catch(() => null);
  if (!sent) return null;
  setStickyLastId(guild.id, channelId, sent.id);
  return sent.id;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const message = interaction.options.getString("message", true);
    const existing = getSticky(guild.id, channel.id);
    if (existing?.last_id) {
      await channel.messages.delete(existing.last_id).catch(() => {});
    }
    const sentId = await postSticky(guild, channel.id, message);
    if (!sentId) {
      await interaction.reply({ components: [errPanel("Impossible de publier le message collant.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setSticky(guild.id, channel.id, message, sentId);
    await interaction.reply({ components: [okPanel("📌 Message collant défini : il restera en bas du salon.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // remove
  const existing = getSticky(guild.id, channel.id);
  if (!existing) {
    await interaction.reply({ components: [errPanel("Aucun message collant dans ce salon.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (existing.last_id) {
    await channel.messages.delete(existing.last_id).catch(() => {});
  }
  removeSticky(guild.id, channel.id);
  await interaction.reply({ components: [okPanel("Message collant retiré.")], flags: FLAGS_V2_EPHEMERAL });
}
