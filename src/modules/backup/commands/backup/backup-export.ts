import { SlashCommandBuilder, Collection, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, RoleSelectMenuBuilder, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { row, btn, st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-export")
  .setDescription("Exporter des données du serveur en fichiers JSON ou CSV")
  .setDefaultMemberPermissions(8);

const rd = 0xc63a35;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup-export:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Serveur complet").setValue("guild").setDescription("Paramètres, salons, rôles, emojis (JSON)").setEmoji("🖥️"),
      new StringSelectMenuOptionBuilder().setLabel("Liste des salons").setValue("channels").setDescription("Exporter la liste des salons").setEmoji("💬"),
      new StringSelectMenuOptionBuilder().setLabel("Un salon").setValue("channel").setDescription("Exporter le salon actuel").setEmoji("📝"),
      new StringSelectMenuOptionBuilder().setLabel("Liste des rôles").setValue("roles").setDescription("Exporter la liste des rôles").setEmoji("🎭"),
      new StringSelectMenuOptionBuilder().setLabel("Un rôle").setValue("role").setDescription("Exporter un rôle précis").setEmoji("🏷️"),
      new StringSelectMenuOptionBuilder().setLabel("Bannissements").setValue("bans").setDescription("Exporter la liste des bannis").setEmoji("🔨"),
      new StringSelectMenuOptionBuilder().setLabel("Un message").setValue("message").setDescription("Exporter un message précis").setEmoji("✉️"),
      new StringSelectMenuOptionBuilder().setLabel("Réactions").setValue("reactions").setDescription("Exporter les réactions d'un message").setEmoji("😀")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📤 Exporter\nChoisis les données à exporter dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function formatPicker(action: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 📤 Format\nChoisis le format du fichier exporté."))
    .addActionRowComponents(
      new ActionRowBuilder<any>().addComponents(
        btn(`backup-export:fmt:${action}:json`, "JSON", ButtonStyle.Primary),
        btn(`backup-export:fmt:${action}:csv`, "CSV", ButtonStyle.Secondary)
      )
    );
}

async function sendFile(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction, filename: string, content: string): Promise<void> {
  const buf = Buffer.from(content, "utf8");
  const payload = { files: [{ attachment: buf, name: filename }], flags: V2E };
  if (interaction.isChatInputCommand() || interaction.isModalSubmit()) {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } else {
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
}

function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

type AnyInteraction = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

async function replyResult(interaction: AnyInteraction, comps: any[]): Promise<void> {
  if (interaction.isChatInputCommand() || interaction.isModalSubmit()) {
    if (interaction.replied || interaction.deferred) await interaction.followUp({ components: comps, flags: V2E });
    else await interaction.reply({ components: comps, flags: V2E });
  } else {
    if (interaction.replied || interaction.deferred) await interaction.followUp({ components: comps, flags: V2E });
    else await interaction.update({ components: comps });
  }
}

async function doGuild(interaction: AnyInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  try {
    const d = {
      name: guild.name,
      id: guild.id,
      description: guild.description,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      preferredLocale: guild.preferredLocale,
      icon: guild.iconURL({ extension: "png" }),
      roles: guild.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, position: r.position, permissions: r.permissions.toArray() })),
      channels: guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })),
      emojis: guild.emojis.cache.map((e) => ({ id: e.id, name: e.name })),
      stickers: guild.stickers.cache.map((s) => ({ id: s.id, name: s.name })),
    };
    await sendFile(interaction, `guild-${guild.id}.json`, JSON.stringify(d, null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function doChannels(interaction: AnyInteraction, format: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const isCSV = format === "csv";
  try {
    const rows = [["id", "name", "type", "parent"]];
    for (const c of guild.channels.cache.values()) rows.push([c.id, c.name, String(c.type), c.parentId ?? ""]);
    await sendFile(interaction, `channels.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(guild.channels.cache.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId })), null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function doChannel(interaction: AnyInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  try {
    const ch = interaction.channel;
    const d = ch ? { id: ch.id, name: "name" in ch ? ch.name : undefined, type: ch.type, parentId: (ch as any).parentId } : {};
    await sendFile(interaction, `channel.json`, JSON.stringify(d, null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function doRoles(interaction: AnyInteraction, format: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const isCSV = format === "csv";
  try {
    const rows = [["id", "name", "color", "position", "permissions"]];
    for (const r of guild.roles.cache.values()) rows.push([r.id, r.name, r.hexColor, String(r.position), r.permissions.toArray().join(";")]);
    await sendFile(interaction, `roles.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(guild.roles.cache.map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position, permissions: r.permissions.toArray() })), null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function doRole(interaction: AnyInteraction, roleId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const role: any = guild.roles.cache.get(roleId);
  if (!role) {
    await replyResult(interaction, [st("Error", rd, "No role provided.")]);
    return;
  }
  try {
    const d = { id: role.id, name: role.name, color: role.color, hoist: role.hoist, position: role.position, permissions: (role.permissions as any).toArray() };
    await sendFile(interaction, `role-${role.id}.json`, JSON.stringify(d, null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function doBans(interaction: AnyInteraction, format: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const isCSV = format === "csv";
  try {
    const bans = await guild.bans.fetch();
    const rows = [["id", "username", "reason"]];
    for (const b of bans.values()) rows.push([b.user.id, b.user.username, b.reason ?? ""]);
    await sendFile(interaction, `bans.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(bans.map((b) => ({ id: b.user.id, username: b.user.username, reason: b.reason })), null, 2));
  } catch (err) {
    console.error("[export] failed", err);
    await replyResult(interaction, [st("Error", rd, "An error occurred during the export.")]);
  }
}

async function fetchMessage(interaction: AnyInteraction, raw: string): Promise<any | null> {
  const guild = interaction.guild;
  if (!guild) return null;
  const id = raw.split("/").pop() ?? raw;
  const channel = interaction.channel ?? guild.channels.cache.find((c) => c.isTextBased());
  if (!channel || !(channel as any).isTextBased) {
    await replyResult(interaction, [st("Error", rd, "This command must be used in a text channel.")]);
    return null;
  }
  const msg = await (channel as any).messages.fetch(id).catch(() => null);
  if (!msg) {
    await replyResult(interaction, [st("Error", rd, "Message not found. Make sure to run this in the same channel as the message.")]);
    return null;
  }
  return msg;
}

async function doMessage(interaction: ModalSubmitInteraction, raw: string): Promise<void> {
  const msg = await fetchMessage(interaction, raw);
  if (!msg) return;
  const d = { id: msg.id, author: msg.author?.username, content: msg.content, createdAt: msg.createdTimestamp, attachments: msg.attachments.map((a: any) => a.url) };
  await sendFile(interaction, `message-${msg.id}.json`, JSON.stringify(d, null, 2));
}

async function doReactions(interaction: ModalSubmitInteraction, raw: string, format: string): Promise<void> {
  const msg = await fetchMessage(interaction, raw);
  if (!msg) return;
  const isCSV = format.toLowerCase() === "csv";
  const rows = [["emoji", "count", "users"]];
  for (const r of msg.reactions.cache.values()) {
    const users = await r.users.fetch().catch(() => new Collection());
    rows.push([r.emoji.name ?? r.emoji.id, String(r.count), (users as any).map((u: any) => u.username).join(";")]);
  }
  await sendFile(interaction, `reactions.${isCSV ? "csv" : "json"}`, isCSV ? toCSV(rows) : JSON.stringify(msg.reactions.cache.map((r: any) => ({ emoji: r.emoji.name ?? r.emoji.id, count: r.count })), null, 2));
}

function openModal(interaction: MessageComponentInteraction, customId: string, title: string, fields: { id: string; label: string; required: boolean; placeholder?: string }[]): Promise<void> {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setStyle(TextInputStyle.Short).setRequired(f.required).setMaxLength(400);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    modal.addLabelComponents(new LabelBuilder().setLabel(f.label).setTextInputComponent(input));
  }
  return interaction.showModal(modal);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  // Hub menu
  if (cid === "backup-export:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "guild") {
      await doGuild(interaction);
      return;
    }
    if (action === "channels" || action === "roles" || action === "bans") {
      await interaction.update({ components: [formatPicker(action)] });
      return;
    }
    if (action === "channel") {
      await doChannel(interaction);
      return;
    }
    if (action === "role") {
      const sel = new RoleSelectMenuBuilder()
        .setCustomId("backup-export:pick_role")
        .setPlaceholder("Sélectionne le rôle à exporter…")
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🏷️ Exporter un rôle\nSélectionne le rôle à exporter."))
            .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    if (action === "message") {
      await openModal(interaction, "backup-export:modal:message", "Exporter un message", [
        { id: "message", label: "ID ou lien du message", required: true, placeholder: "123456789012345678" },
      ]);
      return;
    }
    if (action === "reactions") {
      await openModal(interaction, "backup-export:modal:reactions", "Exporter les réactions", [
        { id: "message", label: "ID ou lien du message", required: true, placeholder: "123456789012345678" },
        { id: "format", label: "Format (json ou csv)", required: false, placeholder: "json" },
      ]);
      return;
    }
    return;
  }

  // Format picker
  if (cid.startsWith("backup-export:fmt:")) {
    const parts = cid.split(":");
    const action = parts[2];
    const format = parts[3] ?? "json";
    if (action === "channels") await doChannels(interaction, format);
    else if (action === "roles") await doRoles(interaction, format);
    else if (action === "bans") await doBans(interaction, format);
    return;
  }

  // Role picked
  if (cid === "backup-export:pick_role" && interaction.isRoleSelectMenu()) {
    await doRole(interaction, interaction.values[0]!);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const cid = interaction.customId;
  if (cid === "backup-export:modal:message") {
    await doMessage(interaction, interaction.fields.getTextInputValue("message").trim());
    return;
  }
  if (cid === "backup-export:modal:reactions") {
    await doReactions(
      interaction,
      interaction.fields.getTextInputValue("message").trim(),
      interaction.fields.getTextInputValue("format").trim() || "json"
    );
    return;
  }
}
