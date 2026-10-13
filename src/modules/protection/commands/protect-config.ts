import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SlashCommandBuilder,
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
  actionRow,
  button,
  msgPanel,
  panel,
  sepBlock,
  textBlock,
} from "../../../core/ui.ts";
import { getProtectConfig, saveProtectConfig } from "../func/db.ts";
import type { ProtectConfig } from "../func/db.ts";
import { BLURPLE, isOwnerOrWhitelisted, needGuild, replyErr, statusLine } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("protect-config")
  .setDescription("Configurer la protection du serveur (anti-raid, anti-spam, automod, bienvenue).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s.setName("vue-ensemble").setDescription("Vue d'ensemble de la configuration."))
  .addSubcommand((s) => s.setName("antiraid").setDescription("Configurer l'anti-raid."))
  .addSubcommand((s) => s.setName("antispam").setDescription("Configurer l'anti-spam et le raid automatique."))
  .addSubcommand((s) => s.setName("automod").setDescription("Configurer la modération automatique."))
  .addSubcommand((s) => s.setName("welcome").setDescription("Configurer les actions de bienvenue."));

const CMD = "protect-config";

function navRow(): ReturnType<typeof actionRow> {
  return actionRow(
    button(`${CMD}:menu:antiraid`, "Anti-raid", ButtonStyle.Secondary, "⚔️"),
    button(`${CMD}:menu:antispam`, "Anti-spam", ButtonStyle.Secondary, "🧨"),
    button(`${CMD}:menu:automod`, "Automod", ButtonStyle.Secondary, "🛠️"),
    button(`${CMD}:menu:welcome`, "Bienvenue", ButtonStyle.Secondary, "👋")
  );
}

function backRow(): ReturnType<typeof actionRow> {
  return actionRow(button(`${CMD}:menu:main`, "Retour", ButtonStyle.Primary, "⬅️"));
}

function toggleBtn(customId: string, label: string, enabled: boolean) {
  return button(
    customId,
    `${label} ${enabled ? "✅" : "❌"}`,
    enabled ? ButtonStyle.Success : ButtonStyle.Danger
  );
}

function mainPanel(guild: Guild, cfg: ProtectConfig) {
  const active = Object.values(cfg.antiraid).filter((v) => v === true).length;
  return panel(
    [
      textBlock(`# 🛡️ Configuration de la protection\nServeur **${guild.name}** — sélectionnez une catégorie.`),
      sepBlock(),
      textBlock(
        [
          `⚔️ **Anti-raid** — ${active}/7 protections actives (sanction : \`${cfg.antiraid.punish}\`)`,
          `🧨 **Anti-spam** — ${statusLine(cfg.antispam.enabled)} (raid auto : ${statusLine(cfg.antispam.autoraidmode)})`,
          `🛠️ **Automod** — liens ${statusLine(cfg.automod.links.enabled)} · invitations ${statusLine(cfg.automod.invites.enabled)}`,
          `👋 **Bienvenue** — rôles ${statusLine(cfg.welcome.roles.enabled)} · ghost ping ${statusLine(cfg.welcome.ghostping.enabled)}`,
        ].join("\n")
      ),
    ],
    BLURPLE
  );
}

function antiraidPanel(cfg: ProtectConfig) {
  const a = cfg.antiraid;
  const rows = [
    actionRow(
      toggleBtn(`${CMD}:ar:bots`, "Bots", a.bots),
      toggleBtn(`${CMD}:ar:webhooks`, "Webhooks", a.webhooks),
      toggleBtn(`${CMD}:ar:members`, "Membres", a.members),
      toggleBtn(`${CMD}:ar:channels`, "Salons", a.channels),
      toggleBtn(`${CMD}:ar:roles`, "Rôles", a.roles)
    ),
    actionRow(
      toggleBtn(`${CMD}:ar:identity`, "Identité", a.identity),
      toggleBtn(`${CMD}:ar:permissions`, "Permissions", a.permissions),
      button(`${CMD}:punish`, `Sanction : ${a.punish}`, ButtonStyle.Secondary, "⚖️")
    ),
    backRow(),
  ];
  const body = panel(
    [
      textBlock("# ⚔️ Anti-raid\nChaque protection bloque l'action abusive et applique la sanction choisie."),
      sepBlock(),
      textBlock(
        [
          "🤖 **Bots** — bloque l'ajout de bots non autorisés.",
          "🔗 **Webhooks** — bloque la création de webhooks.",
          "👥 **Membres** — bloque les bans/kicks massifs.",
          "📚 **Salons** — bloque les créations/suppressions massives de salons.",
          "🧭 **Rôles** — bloque les créations/suppressions massives de rôles.",
          "🎭 **Identité** — bloque la modification du nom, de l'icône et de la bannière.",
          "🔧 **Permissions** — bloque l'ajout de permissions dangereuses.",
        ].join("\n")
      ),
    ],
    BLURPLE
  );
  return { components: [body, ...rows], flags: FLAGS_V2 };
}

function antispamPanel(cfg: ProtectConfig) {
  const s = cfg.antispam;
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(`${CMD}:sel:antispam_channels`)
    .setPlaceholder("Salons où le spam est autorisé")
    .setMinValues(0)
    .setMaxValues(25);
  if (!s.enabled) select.setDisabled(true);
  if (s.allowedChannels.length) select.setDefaultChannels(s.allowedChannels.slice(0, 25));
  const limitBtn = button(`${CMD}:as:limit`, `Limite raid auto : ${s.autoraidLimit}`, ButtonStyle.Secondary, "✏️");
  if (!s.autoraidmode) limitBtn.setDisabled(true);
  const body = panel(
    [
      textBlock("# 🧨 Anti-spam et raid automatique\nBloque les membres qui envoient des messages trop rapidement."),
      sepBlock(),
      textBlock(
        `💣 **Raid automatique** — active le mode raid si plus de **${s.autoraidLimit} personnes** rejoignent en moins de 10 secondes.`
      ),
    ],
    BLURPLE
  );
  return {
    components: [
      body,
      actionRow(
        toggleBtn(`${CMD}:as:enabled`, "Anti-spam", s.enabled),
        toggleBtn(`${CMD}:as:autoraidmode`, "Raid auto", s.autoraidmode),
        limitBtn
      ),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select),
      backRow(),
    ],
    flags: FLAGS_V2,
  };
}

function automodSelect(customId: string, placeholder: string, enabled: boolean, channels: string[]) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(25);
  if (!enabled) select.setDisabled(true);
  if (channels.length) select.setDefaultChannels(channels.slice(0, 25));
  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select);
}

function automodPanel(cfg: ProtectConfig) {
  const m = cfg.automod;
  const body = panel(
    [
      textBlock("# 🛠️ Modération automatique\nSupprime les liens et invitations envoyés par les membres (hors admins/bots)."),
      sepBlock(),
      textBlock("🔗 **Liens** — salons où les liens sont interdits.\n📌 **Invitations** — salons où les invitations sont interdites."),
    ],
    BLURPLE
  );
  return {
    components: [
      body,
      actionRow(toggleBtn(`${CMD}:am:links`, "Liens", m.links.enabled), toggleBtn(`${CMD}:am:invites`, "Invitations", m.invites.enabled)),
      automodSelect(`${CMD}:sel:automod_links`, "Salons où les liens sont interdits", m.links.enabled, m.links.channels),
      automodSelect(`${CMD}:sel:automod_invites`, "Salons où les invitations sont interdites", m.invites.enabled, m.invites.channels),
      backRow(),
    ],
    flags: FLAGS_V2,
  };
}

function welcomePanel(cfg: ProtectConfig) {
  const w = cfg.welcome;
  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`${CMD}:sel:welcome_roles`)
    .setPlaceholder("Rôles donnés aux nouveaux membres")
    .setMinValues(0)
    .setMaxValues(25);
  if (!w.roles.enabled) roleSelect.setDisabled(true);
  if (w.roles.roleIds.length) roleSelect.setDefaultRoles(w.roles.roleIds.slice(0, 25));
  const ghostSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`${CMD}:sel:welcome_ghostping`)
    .setPlaceholder("Salons du ghost ping de bienvenue")
    .setMinValues(0)
    .setMaxValues(25)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (!w.ghostping.enabled) ghostSelect.setDisabled(true);
  if (w.ghostping.channels.length) ghostSelect.setDefaultChannels(w.ghostping.channels.slice(0, 25));
  const body = panel(
    [
      textBlock("# 👋 Actions de bienvenue\nCe que fait le bot à l'arrivée d'un nouveau membre (hors bots)."),
      sepBlock(),
      textBlock("👋 **Rôles de bienvenue** — rôles attribués automatiquement.\n👻 **Ghost ping** — mentionne le membre puis supprime le message."),
    ],
    BLURPLE
  );
  return {
    components: [
      body,
      actionRow(toggleBtn(`${CMD}:w:roles`, "Rôles", w.roles.enabled), toggleBtn(`${CMD}:w:ghostping`, "Ghost ping", w.ghostping.enabled)),
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(ghostSelect),
      backRow(),
    ],
    flags: FLAGS_V2,
  };
}

function sectionPayload(guild: Guild, cfg: ProtectConfig, section: string) {
  switch (section) {
    case "antiraid":
      return antiraidPanel(cfg);
    case "antispam":
      return antispamPanel(cfg);
    case "automod":
      return automodPanel(cfg);
    case "welcome":
      return welcomePanel(cfg);
    default:
      return { components: [mainPanel(guild, cfg), navRow()], flags: FLAGS_V2 };
  }
}

const ANTIRAID_KEYS = ["bots", "webhooks", "members", "channels", "roles", "identity", "permissions"] as const;
const PUNISH_ORDER: ProtectConfig["antiraid"]["punish"][] = ["ban", "kick", "derank", "mute"];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche pour configurer la protection.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  const sub = interaction.options.getSubcommand();
  const section = sub === "vue-ensemble" ? "main" : sub;
  await interaction.reply(sectionPayload(guild, cfg, section));
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche pour configurer la protection.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  const action = parts[1];
  const refresh = (section: string) => interaction.update(sectionPayload(guild, cfg, section));

  if (action === "menu") {
    await refresh(parts[2] ?? "main");
    return;
  }

  if (action === "ar" && interaction.isButton()) {
    const key = parts[2] as (typeof ANTIRAID_KEYS)[number];
    if ((ANTIRAID_KEYS as readonly string[]).includes(key)) {
      cfg.antiraid[key] = !cfg.antiraid[key];
      saveProtectConfig(guild.id, cfg);
    }
    await refresh("antiraid");
    return;
  }

  if (action === "punish" && interaction.isButton()) {
    const idx = PUNISH_ORDER.indexOf(cfg.antiraid.punish);
    const next = PUNISH_ORDER[(idx + 1) % PUNISH_ORDER.length];
    cfg.antiraid.punish = next ?? "ban";
    saveProtectConfig(guild.id, cfg);
    await refresh("antiraid");
    return;
  }

  if (action === "as" && interaction.isButton()) {
    const key = parts[2];
    if (key === "enabled") cfg.antispam.enabled = !cfg.antispam.enabled;
    else if (key === "autoraidmode") cfg.antispam.autoraidmode = !cfg.antispam.autoraidmode;
    else if (key === "limit") {
      const modal = new ModalBuilder().setCustomId(`${CMD}:limitmodal`).setTitle("Raid automatique").addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("limit")
            .setLabel("Limite de nouveaux membres (min. 2)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(cfg.antispam.autoraidLimit))
        )
      );
      await interaction.showModal(modal);
      return;
    }
    saveProtectConfig(guild.id, cfg);
    await refresh("antispam");
    return;
  }

  if (action === "am" && interaction.isButton()) {
    const key = parts[2];
    if (key === "links") cfg.automod.links.enabled = !cfg.automod.links.enabled;
    else if (key === "invites") cfg.automod.invites.enabled = !cfg.automod.invites.enabled;
    saveProtectConfig(guild.id, cfg);
    await refresh("automod");
    return;
  }

  if (action === "w" && interaction.isButton()) {
    const key = parts[2];
    if (key === "roles") cfg.welcome.roles.enabled = !cfg.welcome.roles.enabled;
    else if (key === "ghostping") cfg.welcome.ghostping.enabled = !cfg.welcome.ghostping.enabled;
    saveProtectConfig(guild.id, cfg);
    await refresh("welcome");
    return;
  }

  if (action === "sel" && interaction.isChannelSelectMenu()) {
    const target = parts[2];
    const values = interaction.values;
    if (target === "antispam_channels") {
      cfg.antispam.allowedChannels = values;
      saveProtectConfig(guild.id, cfg);
      await refresh("antispam");
    } else if (target === "automod_links") {
      cfg.automod.links.channels = values;
      saveProtectConfig(guild.id, cfg);
      await refresh("automod");
    } else if (target === "automod_invites") {
      cfg.automod.invites.channels = values;
      saveProtectConfig(guild.id, cfg);
      await refresh("automod");
    } else if (target === "welcome_ghostping") {
      cfg.welcome.ghostping.channels = values;
      saveProtectConfig(guild.id, cfg);
      await refresh("welcome");
    }
    return;
  }

  if (action === "sel" && interaction.isRoleSelectMenu() && parts[2] === "welcome_roles") {
    cfg.welcome.roles.roleIds = interaction.values;
    saveProtectConfig(guild.id, cfg);
    await refresh("welcome");
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "limitmodal") return;
  if (!isOwnerOrWhitelisted(guild, interaction.user.id)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou être dans la liste blanche.");
    return;
  }
  const cfg = getProtectConfig(guild.id);
  const raw = interaction.fields.getTextInputValue("limit").trim();
  const limit = parseInt(raw, 10);
  if (!Number.isFinite(limit) || limit < 2) {
    await replyErr(interaction, "❌ La limite doit être un nombre entier d'au moins 2.");
    return;
  }
  cfg.antispam.autoraidLimit = limit;
  saveProtectConfig(guild.id, cfg);
  await interaction.deferUpdate();
  try {
    await interaction.message?.edit(antispamPanel(cfg));
  } catch {
    // ignore
  }
}
