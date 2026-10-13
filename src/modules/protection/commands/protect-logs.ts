import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  msgPanel,
  okPanel,
  panel,
  sepBlock,
  textBlock,
} from "../../../core/ui.ts";
import { getProtectConfig, saveProtectConfig } from "../func/db.ts";
import type { ProtectConfig } from "../func/db.ts";
import { BLURPLE, isOwnerOrWhitelisted, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("protect-logs")
  .setDescription("Configurer les salons de logs du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const CMD = "protect-logs";

const HUB_OPTIONS = [
  { label: "Voir les salons", value: "voir", emoji: "🧾", description: "Afficher les salons de logs configurés" },
  { label: "Création automatique", value: "auto", emoji: "⚡", description: "Créer les salons de logs automatiquement" },
  { label: "Définir manuellement", value: "definir", emoji: "✏️", description: "Choisir chaque salon de logs" },
];

function menuRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:menu`)
    .setPlaceholder("Choisis une action…")
    .addOptions(
      HUB_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDescription(o.description)
          .setEmoji(o.emoji)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function hubPayload(guild: Guild) {
  const body = panel(
    [textBlock(`# 🧾 Logs du serveur\nConfigure les salons de logs sur **${guild.name}**.`)],
    BLURPLE
  );
  return {
    components: [body, menuRow()],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

/** Extrait un ID de salon depuis une mention <#id> ou un ID brut. */
function parseChannelId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<#(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? null;
}

function definirModal() {
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:definir`).setTitle("Salons de logs");
  const fields: [string, string, string][] = [
    ["antiraid", "Anti-raid", "Mention ou ID du salon (vide = inchangé)"],
    ["moderation", "Modération", "Mention ou ID du salon (vide = inchangé)"],
    ["membres", "Membres", "Mention ou ID du salon (vide = inchangé)"],
    ["serveur", "Serveur", "Mention ou ID du salon (vide = inchangé)"],
    ["messages", "Messages", "Mention ou ID du salon (vide = inchangé)"],
  ];
  for (const [id, label, placeholder] of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(40)
          .setPlaceholder(placeholder)
      )
    );
  }
  return modal;
}

const LOG_DEFS = [
  { key: "antiraid", label: "Anti-raid", name: "logs-antiraid" },
  { key: "moderation", label: "Modération", name: "logs-moderation" },
  { key: "members", label: "Membres", name: "logs-membres" },
  { key: "server", label: "Serveur", name: "logs-serveur" },
  { key: "messages", label: "Messages", name: "logs-messages" },
] as const;

type LogKey = (typeof LOG_DEFS)[number]["key"];

function logsPanel(guild: Guild, cfg: ProtectConfig) {
  const lines = LOG_DEFS.map((d) => {
    const id = cfg.logs[d.key];
    return `${id ? "✅" : "⚪"} **${d.label}** — ${id ? `<#${id}>` : "*non configuré*"}`;
  });
  return panel(
    [
      textBlock(`# 🧾 Logs du serveur\nSalons utilisés pour les logs sur **${guild.name}**.`),
      sepBlock(),
      textBlock(lines.join("\n")),
    ],
    BLURPLE
  );
}

async function autoConfigure(guild: Guild, cfg: ProtectConfig): Promise<void> {
  let category = cfg.logs.categoryId ? guild.channels.cache.get(cfg.logs.categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category = await guild.channels.create({
      name: "Logs",
      type: ChannelType.GuildCategory,
      reason: "Configuration automatique des logs (Fusion Protect)",
    });
    cfg.logs.categoryId = category.id;
  }

  const me = guild.members.me;
  const overwrites = me
    ? [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles,
          ],
        },
      ]
    : [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];

  for (const def of LOG_DEFS) {
    const key = def.key as LogKey;
    let channel = cfg.logs[key] ? guild.channels.cache.get(cfg.logs[key] as string) : null;
    if (!channel || !channel.isTextBased()) {
      channel = await guild.channels.create({
        name: def.name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: overwrites,
        reason: "Configuration automatique des logs (Fusion Protect)",
      });
      cfg.logs[key] = channel.id;
    } else if ("setParent" in channel && channel.parentId !== category.id) {
      await channel.setParent(category.id, { reason: "Configuration automatique des logs (Fusion Protect)" }).catch(() => {});
    }
  }
  cfg.logs.autoConfigured = true;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  if (parts[1] !== "menu" || !interaction.isStringSelectMenu()) return;
  const cfg = getProtectConfig(guild.id);
  const action = interaction.values[0];

  if (action === "voir") {
    await interaction.update({ components: [logsPanel(guild, cfg), menuRow()], flags: FLAGS_V2 });
    return;
  }

  if (action === "auto") {
    await interaction.deferUpdate();
    try {
      await autoConfigure(guild, cfg);
      saveProtectConfig(guild.id, cfg);
    } catch (err) {
      await interaction.editReply({
        components: [
          msgPanel(`❌ Échec de la configuration automatique : ${err instanceof Error ? err.message : "erreur inconnue"}`, BLURPLE),
          menuRow(),
        ],
        flags: FLAGS_V2,
      });
      return;
    }
    await interaction.editReply({
      components: [okPanel("✅ Salons de logs créés dans la catégorie **Logs**."), logsPanel(guild, cfg), menuRow()],
      flags: FLAGS_V2,
    });
    return;
  }

  if (action === "definir") {
    await interaction.showModal(definirModal());
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal" || parts[2] !== "definir") return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  const mapping: [string, "antiraid" | "moderation" | "members" | "server" | "messages"][] = [
    ["antiraid", "antiraid"],
    ["moderation", "moderation"],
    ["membres", "members"],
    ["serveur", "server"],
    ["messages", "messages"],
  ];
  let changed = 0;
  const errors: string[] = [];
  for (const [field, key] of mapping) {
    const raw = interaction.fields.getTextInputValue(field).trim();
    if (!raw) continue;
    const id = parseChannelId(raw);
    const ch = id ? guild.channels.cache.get(id) : null;
    if (!ch || !ch.isTextBased()) {
      errors.push(`\`${raw}\` : salon invalide.`);
      continue;
    }
    cfg.logs[key] = ch.id;
    changed++;
  }
  if (errors.length) {
    await interaction.reply({
      components: [msgPanel(`❌ ${errors.join(" ")}`, BLURPLE)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  if (!changed) {
    await replyErr(interaction, "❌ Précisez au moins un salon à configurer.");
    return;
  }
  saveProtectConfig(guild.id, cfg);
  await interaction.reply({
    components: [okPanel(`✅ ${changed} salon${changed > 1 ? "s" : ""} de logs mis à jour.`), logsPanel(guild, cfg)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
