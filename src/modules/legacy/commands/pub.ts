import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ChannelSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  GuildMember,
  User,
  ContainerBuilder,
} from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import {
  getPubChannel,
  setPubChannel,
  getPubCount,
  topPub,
  pubRank,
} from "../func/db-plus.ts";

export const data = new SlashCommandBuilder()
  .setName("pub")
  .setDescription("Gère le salon de pubs et le classement des partenaires.");

const MENU_ID = "pub:menu";
const MODAL_CONFIG = "pub:modal:config";
const MODAL_STATS = "pub:modal:stats";

const MEDALS = ["🥇", "🥈", "🥉"];

function staffOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
}

/** Hub : menu d'actions (réponse éphémère). */
function hubComponents(): [ContainerBuilder, ActionRowBuilder<StringSelectMenuBuilder>] {
  const head = panel(
    [
      textBlock("## 📢 Pubs & partenariats"),
      textBlock("Comptabilise les pubs postées et affiche le classement. Choisis une action dans le menu ci-dessous."),
    ],
    GOLD
  );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Choisis une action…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Configurer le salon de pubs")
          .setValue("config")
          .setEmoji("⚙️")
          .setDescription("Définit le salon où les pubs sont comptabilisées."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Voir le classement")
          .setValue("stats")
          .setEmoji("🏆")
          .setDescription("Affiche le top des membres ou les stats d'un membre.")
      )
  );
  return [head, row];
}

function configModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_CONFIG).setTitle("Salon de pubs");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Salon de pubs")
      .setDescription("Les pubs postées ici seront comptabilisées.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId("salon")
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder("Choisir le salon…")
      )
  );
  return modal;
}

function statsModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_STATS).setTitle("Statistiques de pubs");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Membre")
      .setDescription("Laisse vide pour voir le classement général.")
      .setUserSelectMenuComponent(
        new UserSelectMenuBuilder().setCustomId("membre").setPlaceholder("Choisir un membre…")
      )
  );
  return modal;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const [head, row] = hubComponents();
  await interaction.reply({ components: [head, row], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "config". */
async function runConfig(interaction: ModalSubmitInteraction, salonId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!staffOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé au staff (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setPubChannel(guild.id, salonId);
  await interaction.reply({ components: [okPanel(`📢 Les pubs postées dans <#${salonId}> seront comptabilisées.`)], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "stats". */
async function runStats(interaction: ModalSubmitInteraction, memberOpt: User | null): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const channelId = getPubChannel(guild.id);
  if (!channelId) {
    await interaction.reply({ components: [errPanel("Aucun salon de pubs configuré. Utilise le menu « Configurer le salon de pubs ».")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (memberOpt) {
    const count = getPubCount(guild.id, memberOpt.id);
    const rank = pubRank(guild.id, memberOpt.id);
    const rankLine = rank > 0 ? `\n**Rang :** #${rank}` : "";
    await interaction.reply({
      components: [
        panel(
          [textBlock(`## 📢 Stats de pub — ${memberOpt.username}\n**Pubs postées :** \`${count}\`${rankLine}`)],
          BLUE
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const top = topPub(guild.id, 10);
  if (top.length === 0) {
    await interaction.reply({ components: [errPanel("Aucune pub comptabilisée pour le moment.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = top.map((s, i) => {
    const medal = MEDALS[i] ?? `\`${i + 1}.\``;
    return `${medal} <@${s.user_id}> — **${s.count}** pub(s)`;
  });
  await interaction.reply({
    components: [
      panel(
        [
          textBlock(`## 📢 Classement des pubs\n*Salon : <#${channelId}>*`),
          sepBlock(false),
          textBlock(lines.join("\n")),
        ],
        GOLD
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId !== MENU_ID) return;
  if (!interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];
  if (action === "config") {
    await interaction.showModal(configModal());
    return;
  }
  if (action === "stats") {
    await interaction.showModal(statsModal());
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === MODAL_CONFIG) {
    const chans = interaction.fields.getSelectedChannels("salon", true);
    const salonId = chans.firstKey();
    if (!salonId) {
      await interaction.reply({ components: [errPanel("Sélectionne un salon.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runConfig(interaction, salonId);
    return;
  }

  if (interaction.customId === MODAL_STATS) {
    const users = interaction.fields.getSelectedUsers("membre");
    const memberOpt = users?.first() ?? null;
    await runStats(interaction, memberOpt);
    return;
  }
}
