import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { isModuleEnabled, setModuleEnabled } from "../../../core/db.ts";
import {
  panel,
  textBlock,
  sepBlock,
  button,
  actionRow,
  msgPanel,
  FLAGS_V2_EPHEMERAL,
} from "../func/ui.ts";
import {
  ensureGuild,
  saveGuild,
  parseWhitelist,
  wlAdd,
  wlRemove,
  parseNukeActions,
  setNukeAction,
  parseBeastScores,
  setBeastScore,
  parsePerms,
  addPerm,
  resetPerms,
} from "../func/db.ts";
import type { Guild as GuildCfg } from "../func/db.ts";
import { PERMS, permName } from "../func/perm.ts";
import { lockChannel, unlockChannel, markLocked, unmarkLocked, textChannels } from "../func/lock.ts";

// NOTE : le préfixe des customId DOIT être le nom de la commande.
// Le routeur central (src/core/events/client/interactionCreate.ts) fait
// `commands.get(customId.split(":")[0])` : tout autre préfixe (ex "ar:")
// rendrait les boutons/menus/modals inactifs ("Ce composant n'est plus actif.").
const P = "config-antiraid";
const BLUE = 0x297fb9;

export const data = new SlashCommandBuilder()
  .setName("config-antiraid")
  .setDescription("🛡️ Panneau de configuration anti-raid")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------

const NUKE_ORDER = [
  "ban", "kick",
  "role_create", "role_delete",
  "channel_create", "channel_delete",
  "bot", "prune",
  "role_update", "role_add",
  "invite",
];
const NUKE_LABELS: Record<string, string> = {
  ban: "Anti-ban",
  kick: "Anti-expulsion",
  role_create: "Anti-création de rôle",
  role_delete: "Anti-suppression de rôle",
  channel_create: "Anti-création de salon",
  channel_delete: "Anti-suppression de salon",
  bot: "Anti-ajout de bot",
  prune: "Anti-purge",
  role_update: "Anti-modification de rôle",
  role_add: "Anti-attribution de rôle",
  invite: "Anti-liens d'invitation",
};
const NUKE_LIMITED = ["ban", "kick", "role_create", "role_delete", "channel_create", "channel_delete"];

const BEAST_ORDER = [
  "score_limit", "ban", "kick",
  "channel_create", "channel_delete",
  "role_create", "role_delete", "role_update", "role_add",
  "bot_add", "prune",
];
const BEAST_LABELS: Record<string, string> = {
  score_limit: "Limite de score",
  ban: "Bannissement",
  kick: "Expulsion",
  channel_create: "Création de salon",
  channel_delete: "Suppression de salon",
  role_create: "Création de rôle",
  role_delete: "Suppression de rôle",
  role_update: "Modification de rôle",
  role_add: "Attribution de rôle",
  bot_add: "Ajout de bot",
  prune: "Purge de membres",
};

const WL_TYPES = ["users", "roles", "channels"] as const;
type WlType = (typeof WL_TYPES)[number];
const WL_LABELS: Record<WlType, string> = { users: "Utilisateurs", roles: "Rôles", channels: "Salons" };

const PUNISH_LABELS: Record<string, string> = { KICK: "Expulsion", BAN: "Bannissement" };

function punishLabel(v: string): string {
  return PUNISH_LABELS[v.toUpperCase()] ?? v;
}

// État transitoire : membre choisi dans "Permissions > Ajouter", en attente du niveau.
const pendingPermUser = new Map<string, string>();

// ---------------------------------------------------------------------------
// Gardes & helpers
// ---------------------------------------------------------------------------

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = (interaction.member as GuildMember | null)?.permissions;
  return perms?.has(PermissionFlagsBits.Administrator) ?? false;
}

async function deny(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): Promise<void> {
  await interaction.reply({
    components: [msgPanel("❌ Tu n'as pas la permission d'utiliser ce panneau (Administrateur requis).", BLUE)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

function backRow() {
  return actionRow(button(`${P}:home`, "⬅️ Retour", ButtonStyle.Secondary));
}

function selectRow(menu: StringSelectMenuBuilder | UserSelectMenuBuilder | RoleSelectMenuBuilder | ChannelSelectMenuBuilder) {
  return new ActionRowBuilder<
    StringSelectMenuBuilder | UserSelectMenuBuilder | RoleSelectMenuBuilder | ChannelSelectMenuBuilder
  >().addComponents(menu);
}

function nukeSelectMenu(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(`${P}:nuke:select`)
    .setPlaceholder("Choisis une action anti-nuke…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      NUKE_ORDER.map((k) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(NUKE_LABELS[k] ?? k)
          .setValue(k)
          .setEmoji("🛡️")
      )
    );
}

function nameOf(guild: Guild, type: WlType, id: string): string {
  if (type === "roles") return guild.roles.cache.get(id)?.name ?? `Rôle ${id}`;
  if (type === "channels") return guild.channels.cache.get(id)?.name ?? `Salon ${id}`;
  return guild.members.cache.get(id)?.displayName ?? `Membre ${id}`;
}

function mentionOf(type: WlType, id: string): string {
  if (type === "roles") return `<@&${id}>`;
  if (type === "channels") return `<#${id}>`;
  return `<@${id}>`;
}

function listBlock(guild: Guild, type: WlType, ids: string[]): string {
  if (!ids.length) return `> *Aucun ${WL_LABELS[type].toLowerCase()} en liste blanche.*`;
  const shown = ids.slice(0, 12).map((id) => `> ${mentionOf(type, id)}`);
  const more = ids.length > 12 ? `\n> *…et ${ids.length - 12} autre(s).*` : "";
  return shown.join("\n") + more;
}

// ---------------------------------------------------------------------------
// Rendus (chaque section reconstruit son panneau)
// ---------------------------------------------------------------------------

function renderHome(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const enabled = isModuleEnabled(guild.id, "security");
  const blocks = [
    textBlock(`# 🛡️ Configuration Anti-Raid\nPanneau central de la sécurité de **${guild.name}**.`),
    sepBlock(),
    textBlock(`> **Module sécurité :** ${enabled ? "🟢 Activé" : "🔴 Désactivé"}`),
    textBlock(
      `> **Anti-Nuke :** ${cfg.nuke_enabled ? "🟢" : "🔴"} · **Vérification :** ${cfg.verify_enabled ? "🟢" : "🔴"} · **Beast Mode :** ${cfg.beast_enabled ? "🟢" : "🔴"}`
    ),
    sepBlock(),
  ];
  const rows = [
    actionRow(
      button(`${P}:sec:nuke`, "Anti-Nuke", ButtonStyle.Primary, "🛡️"),
      button(`${P}:sec:wl`, "Whitelist", ButtonStyle.Primary, "📋"),
      button(`${P}:sec:verify`, "Vérification", ButtonStyle.Primary, "✅")
    ),
    actionRow(
      button(`${P}:sec:lock`, "Raid Lock", ButtonStyle.Primary, "🔒"),
      button(`${P}:sec:perms`, "Permissions", ButtonStyle.Primary, "👑"),
      button(`${P}:sec:beast`, "Beast Mode", ButtonStyle.Primary, "⚡")
    ),
    actionRow(
      button(`${P}:logs:set`, "Salon de logs", ButtonStyle.Secondary, "🧾"),
      button(`${P}:mute:set`, "Rôle muet", ButtonStyle.Secondary, "🔇"),
      button(
        `${P}:toggle`,
        enabled ? "Désactiver le module" : "Activer le module",
        enabled ? ButtonStyle.Danger : ButtonStyle.Success,
        "⏻"
      )
    ),
  ];
  return { components: [panel(blocks, BLUE), ...rows], flags: FLAGS_V2_EPHEMERAL };
}

function renderNuke(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const acts = parseNukeActions(cfg);
  const lines = NUKE_ORDER.map((k) => {
    const a = acts[k] ?? {};
    const st = a.enabled ? "🟢" : "🔴";
    const lim = NUKE_LIMITED.includes(k) ? ` — limite : \`${a.limit ?? "—"}\`` : "";
    return `> ${st} **${NUKE_LABELS[k]}**${lim}`;
  });
  const blocks = [
    textBlock("# 🛡️ Anti-Nuke\nChoisis une action dans le menu pour la configurer."),
    sepBlock(),
    textBlock(lines.join("\n")),
    sepBlock(),
    textBlock(`> **Sanction globale :** \`${punishLabel(cfg.nuke_punishment)}\``),
  ];
  return {
    components: [
      panel(blocks, BLUE),
      selectRow(nukeSelectMenu()),
      actionRow(button(`${P}:nuke:punish`, "Sanction globale", ButtonStyle.Secondary, "⚖️")),
      backRow(),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderNukeDetail(guild: Guild, key: string) {
  const cfg = ensureGuild(guild.id);
  const a = parseNukeActions(cfg)[key] ?? {};
  const label = NUKE_LABELS[key] ?? key;
  const on = a.enabled ?? false;
  const blocks = [
    textBlock(`# ${label}\nÉtat actuel : ${on ? "🟢 **Activé**" : "🔴 **Désactivé**"}`),
    sepBlock(),
  ];
  if (NUKE_LIMITED.includes(key)) {
    blocks.push(textBlock(`> **Limite :** \`${a.limit ?? "—"}\` actions / 10 minutes`));
  }
  const rows = [
    actionRow(
      button(`${P}:nuke:toggle:${key}`, on ? "Désactiver" : "Activer", on ? ButtonStyle.Danger : ButtonStyle.Success, on ? "🔴" : "🟢")
    ),
  ];
  if (NUKE_LIMITED.includes(key)) {
    rows.push(actionRow(button(`${P}:nuke:limit:${key}`, "Définir la limite", ButtonStyle.Primary, "🔢")));
  }
  rows.push(actionRow(button(`${P}:sec:nuke`, "⬅️ Retour aux actions", ButtonStyle.Secondary)));
  return { components: [panel(blocks, BLUE), ...rows], flags: FLAGS_V2_EPHEMERAL };
}

function renderNukePunish() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${P}:nuke:punishpick`)
    .setPlaceholder("Choisis la sanction globale…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Expulsion").setValue("KICK").setEmoji("👢"),
      new StringSelectMenuOptionBuilder().setLabel("Bannissement").setValue("BAN").setEmoji("🔨")
    );
  const blocks = [
    textBlock("# ⚖️ Sanction globale anti-nuke\nSanction appliquée quand une action anti-nuke dépasse sa limite."),
    sepBlock(),
    textBlock("> ℹ️ Le mode « muet » n'est pas proposé : le moteur anti-nuke ne gère que l'expulsion et le bannissement."),
  ];
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:sec:nuke`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderWl(guild: Guild) {
  const wl = parseWhitelist(ensureGuild(guild.id));
  const blocks = [
    textBlock("# 📋 Whitelist\nMembres, rôles et salons exemptés des protections anti-nuke."),
    sepBlock(),
    textBlock(`**👤 ${WL_LABELS.users}** (${wl.users.length})\n${listBlock(guild, "users", wl.users)}`),
    textBlock(`**🎭 ${WL_LABELS.roles}** (${wl.roles.length})\n${listBlock(guild, "roles", wl.roles)}`),
    textBlock(`**📝 ${WL_LABELS.channels}** (${wl.channels.length})\n${listBlock(guild, "channels", wl.channels)}`),
    sepBlock(),
  ];
  return {
    components: [
      panel(blocks, BLUE),
      actionRow(
        button(`${P}:wl:add:users`, "➕ Membre", ButtonStyle.Success),
        button(`${P}:wl:add:roles`, "➕ Rôle", ButtonStyle.Success),
        button(`${P}:wl:add:channels`, "➕ Salon", ButtonStyle.Success)
      ),
      actionRow(
        button(`${P}:wl:rm:users`, "➖ Membre", ButtonStyle.Danger),
        button(`${P}:wl:rm:roles`, "➖ Rôle", ButtonStyle.Danger),
        button(`${P}:wl:rm:channels`, "➖ Salon", ButtonStyle.Danger)
      ),
      backRow(),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderWlAdd(guild: Guild, type: WlType) {
  const menu =
    type === "users"
      ? new UserSelectMenuBuilder().setCustomId(`${P}:wl:pick:users`).setPlaceholder("Choisis les membres à ajouter…").setMinValues(1).setMaxValues(10)
      : type === "roles"
        ? new RoleSelectMenuBuilder().setCustomId(`${P}:wl:pick:roles`).setPlaceholder("Choisis les rôles à ajouter…").setMinValues(1).setMaxValues(10)
        : new ChannelSelectMenuBuilder()
            .setCustomId(`${P}:wl:pick:channels`)
            .setPlaceholder("Choisis les salons à ajouter…")
            .setMinValues(1)
            .setMaxValues(10)
            .setChannelTypes(ChannelType.GuildText);
  const blocks = [
    textBlock(`# ➕ Ajouter à la whitelist\nSélectionne ${type === "users" ? "les membres" : type === "roles" ? "les rôles" : "les salons"} à exempter des protections.`),
  ];
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:sec:wl`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderWlRemove(guild: Guild, type: WlType) {
  const wl = parseWhitelist(ensureGuild(guild.id));
  const ids = wl[type];
  const blocks = [
    textBlock(`# ➖ Retirer de la whitelist\nSélectionne ${type === "users" ? "les membres" : type === "roles" ? "les rôles" : "les salons"} à retirer.`),
  ];
  if (!ids.length) {
    return {
      components: [panel([...blocks, textBlock("> *La liste est vide.*")], BLUE), actionRow(button(`${P}:sec:wl`, "⬅️ Retour", ButtonStyle.Secondary))],
      flags: FLAGS_V2_EPHEMERAL,
    };
  }
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${P}:wl:del:${type}`)
    .setPlaceholder("Choisis quoi retirer…")
    .setMinValues(1)
    .setMaxValues(Math.min(ids.length, 25))
    .addOptions(
      ids.slice(0, 25).map((id) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(nameOf(guild, type, id).slice(0, 100))
          .setValue(id)
          .setEmoji("➖")
      )
    );
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:sec:wl`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderVerify(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const blocks = [
    textBlock(`# ✅ Vérification\nNouveaux membres : ${cfg.verify_enabled ? "🟢 **Vérification activée**" : "🔴 **Vérification désactivée**"}`),
    sepBlock(),
    textBlock(`> **Rôle non vérifié :** ${cfg.verify_role ? `<@&${cfg.verify_role}>` : "*non défini*"}`),
    textBlock(`> **Salon de vérification :** ${cfg.verify_channel ? `<#${cfg.verify_channel}>` : "*non défini*"}`),
  ];
  return {
    components: [
      panel(blocks, BLUE),
      actionRow(
        button(`${P}:verify:toggle`, cfg.verify_enabled ? "Désactiver" : "Activer", cfg.verify_enabled ? ButtonStyle.Danger : ButtonStyle.Success, cfg.verify_enabled ? "🔴" : "🟢"),
        button(`${P}:verify:role`, "Définir le rôle", ButtonStyle.Primary, "🎭"),
        button(`${P}:verify:chan`, "Définir le salon", ButtonStyle.Primary, "📝")
      ),
      backRow(),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderVerifyPick(kind: "role" | "chan") {
  const menu =
    kind === "role"
      ? new RoleSelectMenuBuilder().setCustomId(`${P}:verify:rolepick`).setPlaceholder("Choisis le rôle non vérifié…").setMinValues(1).setMaxValues(1)
      : new ChannelSelectMenuBuilder()
          .setCustomId(`${P}:verify:chanpick`)
          .setPlaceholder("Choisis le salon de vérification…")
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes(ChannelType.GuildText);
  const blocks = [
    textBlock(kind === "role" ? "# 🎭 Rôle non vérifié\nLes nouveaux membres reçoivent ce rôle en attendant leur vérification." : "# 📝 Salon de vérification\nLes nouveaux membres s'y vérifient avant d'accéder au serveur."),
  ];
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:sec:verify`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderLock(guild: Guild) {
  const blocks = [
    textBlock("# 🔒 Raid Lock\nVerrouille les salons textuels en cas de raid (les membres ne peuvent plus y écrire)."),
    sepBlock(),
    textBlock("> ℹ️ Verrouiller retire la permission **Envoyer des messages** à @everyone. Déverrouiller la restaure."),
  ];
  return {
    components: [
      panel(blocks, BLUE),
      actionRow(
        button(`${P}:lock:here`, "Verrouiller ce salon", ButtonStyle.Danger, "🔒"),
        button(`${P}:unlock:here`, "Déverrouiller ce salon", ButtonStyle.Success, "🔓")
      ),
      actionRow(
        button(`${P}:lock:all`, "Verrouiller tout", ButtonStyle.Danger, "🔒"),
        button(`${P}:unlock:all`, "Déverrouiller tout", ButtonStyle.Success, "🔓")
      ),
      backRow(),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderPerms(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const perms = parsePerms(cfg);
  const entries = Object.entries(perms).filter(([, list]) => list.length > 0);
  const blocks = [
    textBlock("# 👑 Permissions\nQui peut utiliser les commandes de modération du module sécurité."),
    sepBlock(),
  ];
  if (!entries.length) {
    blocks.push(textBlock("> *Aucune permission accordée pour le moment.*"));
  } else {
    blocks.push(
      textBlock(
        entries
          .slice(0, 15)
          .map(([id, list]) => `> <@${id}> — ${list.map((p) => `\`${permName(p)}\``).join(", ")}`)
          .join("\n") + (entries.length > 15 ? `\n> *…et ${entries.length - 15} autre(s).*` : "")
      )
    );
  }
  const rmButtons = entries.slice(0, 20).map(([id]) =>
    button(`${P}:perm:rm:${id}`, `Retirer ${guild.members.cache.get(id)?.displayName ?? id}`.slice(0, 80), ButtonStyle.Danger, "➖")
  );
  const rows = [
    actionRow(button(`${P}:perm:add`, "➕ Ajouter une permission", ButtonStyle.Success)),
  ];
  for (let i = 0; i < rmButtons.length; i += 5) {
    rows.push(actionRow(...rmButtons.slice(i, i + 5)));
  }
  rows.push(backRow());
  return { components: [panel(blocks, BLUE), ...rows], flags: FLAGS_V2_EPHEMERAL };
}

function renderPermAdd() {
  const userMenu = new UserSelectMenuBuilder()
    .setCustomId(`${P}:perm:pick`)
    .setPlaceholder("1️⃣ Choisis le membre…")
    .setMinValues(1)
    .setMaxValues(1);
  const levelMenu = new StringSelectMenuBuilder()
    .setCustomId(`${P}:perm:level`)
    .setPlaceholder("2️⃣ Choisis le niveau de permission…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      PERMS.map((p) => new StringSelectMenuOptionBuilder().setLabel(p.name).setValue(String(p.value)).setEmoji("🔑"))
    );
  const blocks = [
    textBlock("# ➕ Ajouter une permission\n1. Choisis le membre, 2. choisis le niveau de permission."),
  ];
  return {
    components: [panel(blocks, BLUE), selectRow(userMenu), selectRow(levelMenu), actionRow(button(`${P}:sec:perms`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderBeast(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const scores = parseBeastScores(cfg);
  const blocks = [
    textBlock(`# ⚡ Beast Mode\nSurveillance par score : ${cfg.beast_enabled ? "🟢 **Activé**" : "🔴 **Désactivé**"}`),
    sepBlock(),
    textBlock(`> **Limite de score :** \`${scores.score_limit ?? cfg.beast_score_limit}\` · **Sanction :** \`${cfg.beast_punishment}\``),
    sepBlock(),
    textBlock("> Choisis un score dans le menu pour le modifier."),
  ];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${P}:beast:select`)
    .setPlaceholder("Choisis un score à modifier…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      BEAST_ORDER.map((k) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(BEAST_LABELS[k] ?? k)
          .setValue(k)
          .setDescription(`Actuel : ${scores[k] ?? "—"}`)
          .setEmoji("📊")
      )
    );
  return {
    components: [
      panel(blocks, BLUE),
      actionRow(
        button(`${P}:beast:toggle`, cfg.beast_enabled ? "Désactiver" : "Activer", cfg.beast_enabled ? ButtonStyle.Danger : ButtonStyle.Success, cfg.beast_enabled ? "🔴" : "🟢")
      ),
      selectRow(menu),
      backRow(),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderLogsPick() {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId(`${P}:logs:pick`)
    .setPlaceholder("Choisis le salon des logs de sécurité…")
    .setMinValues(1)
    .setMaxValues(1)
    .setChannelTypes(ChannelType.GuildText);
  const blocks = [textBlock("# 🧾 Salon de logs de sécurité\nLes actions de sécurité (anti-nuke, beast mode, raids) y seront journalisées.")];
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:home`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

function renderMutePick() {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`${P}:mute:pick`)
    .setPlaceholder("Choisis le rôle muet…")
    .setMinValues(1)
    .setMaxValues(1);
  const blocks = [textBlock("# 🔇 Rôle muet\nRôle appliqué aux membres sanctionnés par un mute.")];
  return {
    components: [panel(blocks, BLUE), selectRow(menu), actionRow(button(`${P}:home`, "⬅️ Retour", ButtonStyle.Secondary))],
    flags: FLAGS_V2_EPHEMERAL,
  };
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function nukeLimitModal(key: string, current?: number): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${P}:modal:nuke:limit:${key}`)
    .setTitle(`Limite — ${NUKE_LABELS[key] ?? key}`.slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId("limit")
    .setLabel("Limite (actions / 10 minutes)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3)
    .setPlaceholder("Ex : 5");
  if (current !== undefined) input.setValue(String(current));
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

function beastScoreModal(key: string, current?: number): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`${P}:modal:beast:score:${key}`)
    .setTitle(`Score — ${BEAST_LABELS[key] ?? key}`.slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId("score")
    .setLabel("Points (0 à 1000)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4)
    .setPlaceholder("Ex : 10");
  if (current !== undefined) input.setValue(String(current));
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

// ---------------------------------------------------------------------------
// Commande
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("Cette commande ne peut être utilisée que sur un serveur.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canManage(guild, interaction)) {
    await deny(interaction);
    return;
  }
  await interaction.reply(renderHome(guild));
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!canManage(guild, interaction)) {
    await deny(interaction);
    return;
  }
  const cid = interaction.customId;
  if (!cid.startsWith(`${P}:`)) return;
  const rest = cid.slice(P.length + 1);
  const parts = rest.split(":");

  // --- Navigation ---
  if (rest === "home") {
    await interaction.update(renderHome(guild));
    return;
  }
  if (rest === "toggle") {
    const cur = isModuleEnabled(guild.id, "security");
    setModuleEnabled(guild.id, "security", !cur);
    await interaction.update(renderHome(guild));
    return;
  }
  if (parts[0] === "sec") {
    const sec = parts[1];
    const payload =
      sec === "nuke" ? renderNuke(guild)
      : sec === "wl" ? renderWl(guild)
      : sec === "verify" ? renderVerify(guild)
      : sec === "lock" ? renderLock(guild)
      : sec === "perms" ? renderPerms(guild)
      : sec === "beast" ? renderBeast(guild)
      : null;
    if (payload) await interaction.update(payload);
    return;
  }

  // --- Anti-Nuke ---
  if (parts[0] === "nuke") {
    if (parts[1] === "select" && interaction.isStringSelectMenu()) {
      const key = interaction.values[0] ?? "";
      if (NUKE_ORDER.includes(key)) await interaction.update(renderNukeDetail(guild, key));
      return;
    }
    if (parts[1] === "toggle" && parts[2]) {
      const key = parts[2];
      const cur = parseNukeActions(ensureGuild(guild.id))[key]?.enabled ?? false;
      setNukeAction(guild.id, key, { enabled: !cur });
      await interaction.update(renderNukeDetail(guild, key));
      return;
    }
    if (parts[1] === "limit" && parts[2] && NUKE_LIMITED.includes(parts[2])) {
      const key = parts[2];
      const cur = parseNukeActions(ensureGuild(guild.id))[key]?.limit;
      await interaction.showModal(nukeLimitModal(key, cur));
      return;
    }
    if (parts[1] === "punish") {
      await interaction.update(renderNukePunish());
      return;
    }
    if (parts[1] === "punishpick" && interaction.isStringSelectMenu()) {
      const v = (interaction.values[0] ?? "BAN").toUpperCase();
      const val = v === "KICK" ? "KICK" : "BAN";
      const cfg = ensureGuild(guild.id);
      cfg.nuke_punishment = val;
      saveGuild(cfg);
      await interaction.update(renderNuke(guild));
      return;
    }
    return;
  }

  // --- Whitelist ---
  if (parts[0] === "wl") {
    const type = parts[2] as WlType | undefined;
    if (parts[1] === "add" && type && (WL_TYPES as readonly string[]).includes(type)) {
      await interaction.update(renderWlAdd(guild, type));
      return;
    }
    if (parts[1] === "pick" && type && (WL_TYPES as readonly string[]).includes(type)) {
      const ids = interaction.isUserSelectMenu() || interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()
        ? interaction.values
        : [];
      for (const id of ids) wlAdd(guild.id, type, id);
      await interaction.update(renderWl(guild));
      return;
    }
    if (parts[1] === "rm" && type && (WL_TYPES as readonly string[]).includes(type)) {
      await interaction.update(renderWlRemove(guild, type));
      return;
    }
    if (parts[1] === "del" && type && (WL_TYPES as readonly string[]).includes(type) && interaction.isStringSelectMenu()) {
      for (const id of interaction.values) wlRemove(guild.id, type, id);
      await interaction.update(renderWl(guild));
      return;
    }
    return;
  }

  // --- Vérification ---
  if (parts[0] === "verify") {
    if (parts[1] === "toggle") {
      const cfg = ensureGuild(guild.id);
      cfg.verify_enabled = cfg.verify_enabled ? 0 : 1;
      saveGuild(cfg);
      await interaction.update(renderVerify(guild));
      return;
    }
    if (parts[1] === "role") {
      await interaction.update(renderVerifyPick("role"));
      return;
    }
    if (parts[1] === "chan") {
      await interaction.update(renderVerifyPick("chan"));
      return;
    }
    if (parts[1] === "rolepick" && interaction.isRoleSelectMenu()) {
      const id = interaction.values[0];
      if (id) {
        const cfg = ensureGuild(guild.id);
        cfg.verify_role = id;
        saveGuild(cfg);
      }
      await interaction.update(renderVerify(guild));
      return;
    }
    if (parts[1] === "chanpick" && interaction.isChannelSelectMenu()) {
      const id = interaction.values[0];
      if (id) {
        const cfg = ensureGuild(guild.id);
        cfg.verify_channel = id;
        saveGuild(cfg);
      }
      await interaction.update(renderVerify(guild));
      return;
    }
    return;
  }

  // --- Raid Lock ---
  if (parts[0] === "lock" || parts[0] === "unlock") {
    const isLock = parts[0] === "lock";
    const target = parts[1];
    await interaction.deferUpdate();
    let msg: string;
    try {
      if (target === "here") {
        const ch = interaction.channel;
        if (!ch || ch.type !== ChannelType.GuildText) {
          throw new Error("notext");
        }
        if (isLock) {
          await lockChannel(ch, "Raid lock via panneau anti-raid");
          markLocked(guild.id, ch.id);
          msg = `🔒 <#${ch.id}> a été **verrouillé**.`;
        } else {
          await unlockChannel(ch, "Raid unlock via panneau anti-raid");
          unmarkLocked(guild.id, ch.id);
          msg = `🔓 <#${ch.id}> a été **déverrouillé**.`;
        }
      } else {
        const chans = textChannels(guild);
        let done = 0;
        for (const ch of chans) {
          try {
            if (isLock) {
              await lockChannel(ch, "Raid lock via panneau anti-raid");
              markLocked(guild.id, ch.id);
            } else {
              await unlockChannel(ch, "Raid unlock via panneau anti-raid");
              unmarkLocked(guild.id, ch.id);
            }
            done++;
          } catch {}
        }
        msg = isLock ? `🔒 **${done}** salon(s) verrouillé(s).` : `🔓 **${done}** salon(s) déverrouillé(s).`;
      }
    } catch {
      msg = "❌ Impossible d'effectuer cette action : vérifie que je peux gérer ce salon.";
    }
    const payload = renderLock(guild);
    payload.components.unshift(panel([textBlock(msg)], BLUE));
    await interaction.editReply(payload).catch(() => {});
    return;
  }

  // --- Permissions ---
  if (parts[0] === "perm") {
    if (parts[1] === "add") {
      pendingPermUser.delete(interaction.user.id);
      await interaction.update(renderPermAdd());
      return;
    }
    if (parts[1] === "pick" && interaction.isUserSelectMenu()) {
      const id = interaction.values[0];
      if (id) pendingPermUser.set(interaction.user.id, id);
      await interaction.update(renderPermAdd());
      return;
    }
    if (parts[1] === "level" && interaction.isStringSelectMenu()) {
      const target = pendingPermUser.get(interaction.user.id);
      const lvl = parseInt(interaction.values[0] ?? "", 10);
      if (!target || !Number.isFinite(lvl) || !PERMS.some((p) => p.value === lvl)) {
        await interaction.reply({
          components: [msgPanel("❌ Choisis d'abord un membre, puis un niveau de permission valide.", BLUE)],
          flags: FLAGS_V2_EPHEMERAL,
        });
        return;
      }
      addPerm(guild.id, target, lvl);
      pendingPermUser.delete(interaction.user.id);
      await interaction.update(renderPerms(guild));
      return;
    }
    if (parts[1] === "rm" && parts[2]) {
      resetPerms(guild.id, parts[2]);
      await interaction.update(renderPerms(guild));
      return;
    }
    return;
  }

  // --- Beast Mode ---
  if (parts[0] === "beast") {
    if (parts[1] === "toggle") {
      const cfg = ensureGuild(guild.id);
      cfg.beast_enabled = cfg.beast_enabled ? 0 : 1;
      saveGuild(cfg);
      await interaction.update(renderBeast(guild));
      return;
    }
    if (parts[1] === "select" && interaction.isStringSelectMenu()) {
      const key = interaction.values[0] ?? "";
      if (BEAST_ORDER.includes(key)) {
        const cur = parseBeastScores(ensureGuild(guild.id))[key];
        await interaction.showModal(beastScoreModal(key, cur));
      }
      return;
    }
    return;
  }

  // --- Logs & Mute ---
  if (parts[0] === "logs" && parts[1] === "set") {
    await interaction.update(renderLogsPick());
    return;
  }
  if (parts[0] === "logs" && parts[1] === "pick" && interaction.isChannelSelectMenu()) {
    const id = interaction.values[0];
    if (id) {
      const cfg = ensureGuild(guild.id);
      cfg.security_log = id;
      saveGuild(cfg);
    }
    await interaction.update(renderHome(guild));
    return;
  }
  if (parts[0] === "mute" && parts[1] === "set") {
    await interaction.update(renderMutePick());
    return;
  }
  if (parts[0] === "mute" && parts[1] === "pick" && interaction.isRoleSelectMenu()) {
    const id = interaction.values[0];
    if (id) {
      const cfg = ensureGuild(guild.id);
      cfg.mute_role = id;
      saveGuild(cfg);
    }
    await interaction.update(renderHome(guild));
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!canManage(guild, interaction)) {
    await deny(interaction);
    return;
  }
  const cid = interaction.customId;
  if (!cid.startsWith(`${P}:modal:`)) return;
  const rest = cid.slice(`${P}:modal:`.length);
  const parts = rest.split(":");

  // Limite anti-nuke : config-antiraid:modal:nuke:limit:<key>
  if (parts[0] === "nuke" && parts[1] === "limit" && parts[2] && NUKE_LIMITED.includes(parts[2])) {
    const key = parts[2];
    const raw = interaction.fields.getTextInputValue("limit").trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      await interaction.reply({
        components: [msgPanel("❌ La limite doit être un nombre entre 0 et 100.", BLUE)],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    setNukeAction(guild.id, key, { limit: n });
    await interaction.reply(renderNukeDetail(guild, key));
    return;
  }

  // Score beast mode : config-antiraid:modal:beast:score:<key>
  if (parts[0] === "beast" && parts[1] === "score" && parts[2] && BEAST_ORDER.includes(parts[2])) {
    const key = parts[2];
    const raw = interaction.fields.getTextInputValue("score").trim();
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      await interaction.reply({
        components: [msgPanel("❌ Le score doit être un nombre entre 0 et 1000.", BLUE)],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    setBeastScore(guild.id, key, n);
    await interaction.reply(renderBeast(guild));
    return;
  }
}
