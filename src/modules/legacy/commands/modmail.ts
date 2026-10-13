import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  BLUE,
  okPanel,
  errPanel,
  panel,
  textBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import {
  getModmailConfig,
  setModmailConfig,
  getTicketByChannel,
  listOpenTickets,
  closeTicket,
} from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("modmail")
  .setDescription("Configure et gère le ModMail (MPs au bot → salon staff).")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("set-category")
      .setDescription("Définit la catégorie où seront créés les salons ModMail.")
      .addChannelOption((o) =>
        o.setName("categorie").setDescription("La catégorie.").addChannelTypes(ChannelType.GuildCategory).setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("log-channel")
      .setDescription("Définit le salon de logs du ModMail.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon de logs.").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
  )
  .addSubcommand((s) => s.setName("close").setDescription("Ferme le ticket ModMail du salon actuel."))
  .addSubcommand((s) => s.setName("list").setDescription("Liste les tickets ModMail ouverts."));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "set-category") {
    const category = interaction.options.getChannel("categorie", true);
    setModmailConfig(guild.id, { category_id: category.id });
    await interaction.reply({
      components: [
        okPanel(
          `## ✅ ModMail activé\n${fieldRaw("Catégorie", category.name ?? "?")}\n\nLes membres peuvent maintenant envoyer un MP au bot pour contacter le staff.`
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "log-channel") {
    const channel = interaction.options.getChannel("salon", true);
    setModmailConfig(guild.id, { log_channel: channel.id });
    await interaction.reply({ components: [okPanel(`Salon de logs ModMail : <#${channel.id}>.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (sub === "close") {
    const ticket = getTicketByChannel(interaction.channelId);
    if (!ticket || ticket.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel("Ce salon n'est pas un ticket ModMail ouvert.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    closeTicket(ticket.id);
    const user = await interaction.client.users.fetch(ticket.user_id).catch(() => null);
    if (user) {
      await user.send({ components: [panel([textBlock(`## 📬 Ticket fermé\nLe staff de **${guild.name}** a fermé ta conversation.`)], BLUE)] }).catch(() => {});
    }
    await interaction.reply({ components: [okPanel(`Ticket #${ticket.id} fermé. Le salon sera supprimé dans quelques secondes.`)], flags: FLAGS_V2_EPHEMERAL });
    setTimeout(() => {
      const ch = interaction.channel as TextBasedChannel | null;
      ch?.delete?.("Ticket ModMail fermé").catch(() => {});
    }, 5000);
    return;
  }

  // list
  const tickets = listOpenTickets(guild.id);
  if (tickets.length === 0) {
    await interaction.reply({ components: [okPanel("Aucun ticket ModMail ouvert.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = tickets.map((t) => `\`#${t.id}\` — <@${t.user_id}> — <#${t.channel_id ?? "?"}> — <t:${Math.floor(t.created_at / 1000)}:R>`).join("\n");
  await interaction.reply({ components: [panel([textBlock(`## 📬 Tickets ModMail ouverts\n${lines}`)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}

/** Retourne la config ModMail (utilisée par l'event messageCreate). */
export function modmailConfigOf(guildId: string) {
  return getModmailConfig(guildId);
}
