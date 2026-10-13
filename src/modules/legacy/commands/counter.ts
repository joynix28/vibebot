import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  Guild,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  ACCENT,
  okPanel,
  errPanel,
  panel,
  textBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { addCounter, removeCounter, listCounters, allCounters } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("counter")
  .setDescription("Affiche des compteurs (membres, bots…) dans le nom de salons vocaux.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const COUNTER_KINDS: Record<string, string> = {
  membres: "Membres",
  humains: "Humains",
  bots: "Bots",
  "en-ligne": "En ligne",
  salons: "Salons",
  boosts: "Boosts",
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  membres: "👥 Membres : {count}",
  humains: "🧍 Humains : {count}",
  bots: "🤖 Bots : {count}",
  "en-ligne": "🟢 En ligne : {count}",
  salons: "📁 Salons : {count}",
  boosts: "🚀 Boosts : {count}",
};

export function applyCounterTemplate(template: string, count: number): string {
  return template.replaceAll("{count}", String(count)).slice(0, 100);
}

/** Calcule la valeur d'un compteur pour un serveur (best effort depuis le cache). */
export async function computeCounterValue(guild: Guild, kind: string): Promise<number> {
  switch (kind) {
    case "membres":
      return guild.memberCount;
    case "salons":
      return guild.channels.cache.size;
    case "boosts":
      return guild.premiumSubscriptionCount ?? 0;
    case "humains":
    case "bots": {
      let members = guild.members.cache;
      if (members.size === 0) {
        try {
          members = await guild.members.fetch();
        } catch {
          return 0;
        }
      }
      const humans = members.filter((m) => !m.user.bot).size;
      return kind === "humains" ? humans : members.size - humans;
    }
    case "en-ligne":
      return guild.members.cache.filter((m) => m.presence?.status && m.presence.status !== "offline").size;
    default:
      return 0;
  }
}

/** Rafraîchit le nom d'un salon compteur si besoin. */
export async function refreshCounter(guild: Guild, channelId: string, kind: string, template: string): Promise<void> {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const value = await computeCounterValue(guild, kind);
  const name = applyCounterTemplate(template, value);
  if (channel.name !== name) {
    await channel.setName(name, "Mise à jour du compteur").catch(() => {});
  }
}

function hubContainer() {
  const container = panel([textBlock("## 📊 Compteurs\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("counter:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Ajouter un compteur")
        .setValue("add")
        .setDescription("Affiche un compteur dans le nom d'un salon vocal.")
        .setEmoji("➕"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Retirer un compteur")
        .setValue("remove")
        .setDescription("Retire le compteur d'un salon vocal.")
        .setEmoji("➖"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lister les compteurs")
        .setValue("list")
        .setDescription("Affiche les compteurs du serveur.")
        .setEmoji("📋")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "counter:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "add") {
    const modal = new ModalBuilder().setCustomId("counter:modal:add").setTitle("Ajouter un compteur");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Salon vocal")
        .setDescription("Mentionne le salon vocal ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        ),
      new LabelBuilder()
        .setLabel("Type")
        .setDescription("membres, humains, bots, en-ligne, salons ou boosts")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("type").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
        ),
      new LabelBuilder()
        .setLabel("Modèle (optionnel)")
        .setDescription("{count} = le nombre. Ex : 👥 Membres : {count}")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("modele").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "remove") {
    const modal = new ModalBuilder().setCustomId("counter:modal:remove").setTitle("Retirer un compteur");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Salon vocal")
        .setDescription("Mentionne le salon vocal ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "list") {
    const counters = listCounters(guild.id);
    if (counters.length === 0) {
      await interaction.update({ components: [errPanel("Aucun compteur configuré.")], flags: FLAGS_V2 });
      return;
    }
    const lines = counters
      .map((c, i) => `\`${i + 1}.\` <#${c.channel_id}> — **${COUNTER_KINDS[c.kind] ?? c.kind}** — \`${c.template}\``)
      .join("\n");
    await interaction.update({ components: [panel([textBlock(`## 📊 Compteurs\n${lines}`)], BLUE)], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === "counter:modal:add") {
    const channelId = interaction.fields.getTextInputValue("salon").match(/\d{17,20}/)?.[0];
    const channel = channelId ? guild.channels.cache.get(channelId) : null;
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ components: [errPanel("Salon vocal introuvable. Mentionne un salon vocal valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const kind = interaction.fields.getTextInputValue("type").trim().toLowerCase();
    if (!COUNTER_KINDS[kind]) {
      await interaction.reply({ components: [errPanel(`Type invalide. Choisis parmi : ${Object.keys(COUNTER_KINDS).join(", ")}.`)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const modeleRaw = interaction.fields.getTextInputValue("modele")?.trim();
    const template = modeleRaw || DEFAULT_TEMPLATES[kind] || "{count}";
    addCounter(guild.id, channel.id, kind, template);
    await refreshCounter(guild, channel.id, kind, template);
    const preview = applyCounterTemplate(template, await computeCounterValue(guild, kind));
    await interaction.reply({
      components: [
        okPanel(
          `## ✅ Compteur ajouté\n${fieldRaw("Salon", `<#${channel.id}>`)}\n${fieldRaw("Type", COUNTER_KINDS[kind] ?? kind)}\n${fieldRaw("Modèle", template)}\n${fieldRaw("Aperçu", preview)}\n\n*Mis à jour automatiquement toutes les 10 minutes.*`
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (interaction.customId === "counter:modal:remove") {
    const channelId = interaction.fields.getTextInputValue("salon").match(/\d{17,20}/)?.[0];
    if (!channelId) {
      await interaction.reply({ components: [errPanel("Salon introuvable. Mentionne un salon vocal valide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const removed = removeCounter(guild.id, channelId);
    await interaction.reply({
      components: [removed ? okPanel(`Compteur retiré de <#${channelId}>.`) : errPanel(`Aucun compteur sur <#${channelId}>.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
}

/** Utilisé par le scheduler : rafraîchit tous les compteurs de tous les serveurs. */
export async function refreshAllCounters(client: { guilds: Guild["client"]["guilds"] }): Promise<void> {
  for (const c of allCounters()) {
    const guild = await client.guilds.fetch(c.guild_id).catch(() => null);
    if (!guild) continue;
    try {
      await refreshCounter(guild, c.channel_id, c.kind, c.template);
    } catch {
      /* salon supprimé ou permissions manquantes */
    }
  }
}
