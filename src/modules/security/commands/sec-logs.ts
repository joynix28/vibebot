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
import { panel, textBlock, msgPanel, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, saveGuild } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("sec-logs")
  .setDescription("Configurer les salons de logs de sécurité.");

const CMD = "sec-logs";
const BLUE = 0x297fb9;

const HUB_OPTIONS = [
  { label: "Logs de sécurité", value: "security", emoji: "🛡️", description: "Salon des actions de sécurité" },
  { label: "Logs de modération", value: "mod", emoji: "🔨", description: "Salon des commandes de modération" },
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
    [textBlock(`# 🧾 Logs de sécurité\nChoisis quel salon de logs configurer sur **${guild.name}**.`)],
    BLUE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

function channelModal(kind: "security" | "mod") {
  const modal = new ModalBuilder()
    .setCustomId(`${CMD}:modal:${kind}`)
    .setTitle(kind === "mod" ? "Logs de modération" : "Logs de sécurité");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("channel")
        .setLabel("Salon (mention ou ID, vide = créer)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(40)
        .setPlaceholder("#logs ou 123456789 (vide pour créer)")
    )
  );
  return modal;
}

/** Extrait un ID de salon depuis une mention <#id> ou un ID brut. */
function parseChannelId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<#(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? null;
}

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = (interaction.member as any)?.permissions;
  return perms?.has(PermissionFlagsBits.ManageGuild) ?? false;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("Cette commande ne peut être utilisée que sur un serveur.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (parts[1] === "menu" && interaction.isStringSelectMenu()) {
    const kind = interaction.values[0];
    if (kind === "security" || kind === "mod") {
      await interaction.showModal(channelModal(kind));
    }
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal") return;
  if (!canManage(guild, interaction)) {
    await interaction.reply({ components: [msgPanel("❌ Vous n'avez pas la permission d'utiliser cette commande.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const kind = parts[2] as "security" | "mod";
  if (kind !== "security" && kind !== "mod") return;

  const raw = interaction.fields.getTextInputValue("channel").trim();
  let ch: any = null;
  if (raw) {
    const id = parseChannelId(raw);
    ch = id ? guild.channels.cache.get(id) ?? null : null;
    if (!ch || !ch.isTextBased()) {
      await interaction.reply({ components: [msgPanel("❌ Salon invalide : mentionne un salon textuel ou colle son ID.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
  } else {
    ch = await guild.channels
      .create({ name: kind === "mod" ? "mod-logs" : "security-logs", type: ChannelType.GuildText, reason: "Security - log setup" })
      .catch(() => null);
  }
  if (!ch) {
    await interaction.reply({ components: [msgPanel("❌ Je n'ai pas pu créer le salon de logs.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const cfg = ensureGuild(guild.id);
  if (kind === "mod") cfg.mod_log = ch.id;
  else cfg.security_log = ch.id;
  saveGuild(cfg);

  const msg =
    kind === "mod"
      ? "Salon des logs de modération configuré avec succès.\n`Note : les logs de modération ne couvrent que les commandes de modération du module sécurité.`"
      : "Salon des logs de sécurité configuré avec succès.";

  await interaction.reply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}
