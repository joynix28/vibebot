import {
  ActionRowBuilder,
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
import { panel, textBlock, msgPanel, FLAGS_V2, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, saveGuild, setBeastScore } from "../func/db.ts";

const SCORE_KEYS = [
  "ban",
  "kick",
  "channel_create",
  "channel_delete",
  "role_create",
  "role_delete",
  "role_update",
  "role_add",
  "bot_add",
  "prune",
];

const SCORE_LABELS: Record<string, string> = {
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

const PUNISHMENTS: { value: number; name: string; key: string }[] = [
  { value: 0, name: "Clear Roles", key: "CLEAR_ROLES" },
  { value: 1, name: "Ban", key: "BAN" },
  { value: 2, name: "Kick", key: "KICK" },
];

export const data = new SlashCommandBuilder()
  .setName("beast")
  .setDescription("Configurer le mode bête (surveillance anti-nuke par score).");

const CMD = "beast";
const BLUE = 0x297fb9;

const HUB_OPTIONS = [
  { label: "Activer", value: "enable", emoji: "🟢", description: "Activer le mode bête" },
  { label: "Désactiver", value: "disable", emoji: "🔴", description: "Désactiver le mode bête" },
  { label: "Limite de score", value: "score_limit", emoji: "🎯", description: "Score déclenchant la sanction" },
  { label: "Sanction", value: "punishment", emoji: "⚖️", description: "Sanction appliquée" },
  ...SCORE_KEYS.map((k) => ({
    label: `Score : ${SCORE_LABELS[k] ?? k}`,
    value: `score:${k}`,
    emoji: "📊",
    description: `Points par ${SCORE_LABELS[k] ?? k}`,
  })),
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
  const cfg = ensureGuild(guild.id);
  const body = panel(
    [
      textBlock(
        `# 👹 Mode bête\nSurveillance par score sur **${guild.name}** — ${cfg.beast_enabled ? "🟢 activé" : "🔴 désactivé"} (limite : \`${cfg.beast_score_limit ?? "—"}\`).`
      ),
    ],
    BLUE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

async function deny(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): Promise<void> {
  await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
}

function intModal(action: string, title: string, label: string, placeholder: string, def?: string) {
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:${action}`).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10)
    .setPlaceholder(placeholder);
  if (def) input.setValue(def);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

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
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

async function answer(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  msg: string
): Promise<void> {
  const payload = { components: [panel([textBlock(msg)], BLUE), menuRow()], flags: FLAGS_V2 };
  if (interaction.isStringSelectMenu() || interaction.isButton()) {
    await interaction.update(payload);
  } else {
    await interaction.reply({ ...payload, flags: FLAGS_V2_EPHEMERAL });
  }
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!canManage(guild, interaction)) {
    await deny(interaction);
    return;
  }
  if (parts[1] !== "menu" || !interaction.isStringSelectMenu()) return;
  const cfg = ensureGuild(guild.id);
  const choice = interaction.values[0] ?? "";

  if (choice === "enable") {
    cfg.beast_enabled = 1;
    saveGuild(cfg);
    await answer(interaction, "🟢 Le mode bête a été **activé**.");
    return;
  }
  if (choice === "disable") {
    cfg.beast_enabled = 0;
    saveGuild(cfg);
    await answer(interaction, "🔴 Le mode bête a été **désactivé**.");
    return;
  }
  if (choice === "score_limit") {
    await interaction.showModal(intModal("score_limit", "Limite de score", "Limite (1 à 1000)", "Ex : 50", String(cfg.beast_score_limit ?? 50)));
    return;
  }
  if (choice === "punishment") {
    const modal = new ModalBuilder().setCustomId(`${CMD}:modal:punishment`).setTitle("Sanction du mode bête");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("value")
          .setLabel("Sanction (0, 1 ou 2)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
          .setPlaceholder("0 = Clear Roles, 1 = Ban, 2 = Kick")
      )
    );
    await interaction.showModal(modal);
    return;
  }
  if (choice.startsWith("score:")) {
    const key = choice.slice("score:".length);
    if (!(SCORE_KEYS as readonly string[]).includes(key)) return;
    await interaction.showModal(intModal(`score:${key}`, "Score", `Points (${SCORE_LABELS[key] ?? key}, 0 à 1000)`, "Ex : 10"));
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal") return;
  if (!canManage(guild, interaction)) {
    await deny(interaction);
    return;
  }
  const cfg = ensureGuild(guild.id);
  const action = parts.slice(2).join(":");
  const raw = interaction.fields.getTextInputValue("value").trim();

  if (action === "score_limit") {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > 1000) {
      await interaction.reply({ components: [msgPanel("❌ La limite doit être un entier entre 1 et 1000.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    cfg.beast_score_limit = n;
    saveGuild(cfg);
    setBeastScore(guild.id, "score_limit", n);
    await interaction.reply({ components: [panel([textBlock(`🎯 La limite de score du mode bête est maintenant de **${n}**.`)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action === "punishment") {
    const t = raw.toLowerCase();
    const p = PUNISHMENTS.find((x) => String(x.value) === t || x.name.toLowerCase() === t || x.key.toLowerCase() === t);
    if (!p) {
      await interaction.reply({ components: [msgPanel("❌ Sanction invalide : 0 (Clear Roles), 1 (Ban) ou 2 (Kick).", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    cfg.beast_punishment = p.key;
    saveGuild(cfg);
    await interaction.reply({ components: [panel([textBlock(`⚖️ La sanction du mode bête est maintenant **${p.name}**.`)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (action.startsWith("score:")) {
    const key = action.slice("score:".length);
    if (!(SCORE_KEYS as readonly string[]).includes(key)) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      await interaction.reply({ components: [msgPanel("❌ Le score doit être un entier entre 0 et 1000.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setBeastScore(guild.id, key, n);
    await interaction.reply({ components: [panel([textBlock(`📊 Le score **${(SCORE_LABELS[key] ?? key).toLowerCase()}** est maintenant de **${n}**.`)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
}
