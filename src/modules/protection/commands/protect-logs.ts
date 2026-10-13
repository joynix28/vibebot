import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
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
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) => s.setName("voir").setDescription("Voir les salons de logs configurés."))
  .addSubcommand((s) =>
    s.setName("auto").setDescription("Créer automatiquement les salons de logs dans une catégorie dédiée.")
  )
  .addSubcommand((s) =>
    s
      .setName("definir")
      .setDescription("Définir manuellement les salons de logs.")
      .addChannelOption((o) =>
        o.setName("antiraid").setDescription("Salon des logs anti-raid.").addChannelTypes(ChannelType.GuildText)
      )
      .addChannelOption((o) =>
        o.setName("moderation").setDescription("Salon des logs de modération.").addChannelTypes(ChannelType.GuildText)
      )
      .addChannelOption((o) =>
        o.setName("membres").setDescription("Salon des logs des membres.").addChannelTypes(ChannelType.GuildText)
      )
      .addChannelOption((o) =>
        o.setName("serveur").setDescription("Salon des logs du serveur.").addChannelTypes(ChannelType.GuildText)
      )
      .addChannelOption((o) =>
        o.setName("messages").setDescription("Salon des logs des messages.").addChannelTypes(ChannelType.GuildText)
      )
  );

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
  const cfg = getProtectConfig(guild.id);
  const sub = interaction.options.getSubcommand();

  if (sub === "voir") {
    await interaction.reply({ components: [logsPanel(guild, cfg)], flags: FLAGS_V2 });
    return;
  }

  if (sub === "auto") {
    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    try {
      await autoConfigure(guild, cfg);
      saveProtectConfig(guild.id, cfg);
    } catch (err) {
      await interaction.editReply({
        components: [msgPanel(`❌ Échec de la configuration automatique : ${err instanceof Error ? err.message : "erreur inconnue"}`, BLURPLE)],
        flags: FLAGS_V2,
      });
      return;
    }
    await interaction.editReply({
      components: [okPanel("✅ Salons de logs créés dans la catégorie **Logs**."), logsPanel(guild, cfg)],
      flags: FLAGS_V2,
    });
    return;
  }

  // definir
  const mapping: [string, LogKey][] = [
    ["antiraid", "antiraid"],
    ["moderation", "moderation"],
    ["membres", "members"],
    ["serveur", "server"],
    ["messages", "messages"],
  ];
  let changed = 0;
  for (const [opt, key] of mapping) {
    const ch = interaction.options.getChannel(opt);
    if (ch) {
      cfg.logs[key] = ch.id;
      changed++;
    }
  }
  if (!changed) {
    await replyErr(interaction, "❌ Précisez au moins un salon à configurer.");
    return;
  }
  saveProtectConfig(guild.id, cfg);
  await interaction.reply({
    components: [okPanel(`✅ ${changed} salon${changed > 1 ? "s" : ""} de logs mis à jour.`), logsPanel(guild, cfg)],
    flags: FLAGS_V2,
  });
}
