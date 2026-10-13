import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { aud, ACT } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-import")
  .setDescription("Importer des données serveur depuis un fichier JSON")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup-import:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Importer le serveur")
        .setValue("guild")
        .setDescription("Importe salons, rôles et paramètres depuis un JSON")
        .setEmoji("📥")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📥 Importer\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

async function doImport(interaction: MessageComponentInteraction, fileUrl: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  try {
    const res = await fetch(fileUrl);
    if (!res.ok) throw new Error("Failed to download file");
    const text = await res.text();
    const data = JSON.parse(text);

    if (!data || typeof data !== "object") throw new Error("Invalid JSON");

    if (data.name) await guild.setName(String(data.name)).catch(() => {});
    if (data.verification_level !== undefined) await guild.setVerificationLevel(data.verification_level).catch(() => {});
    if (data.default_message_notifications !== undefined) await guild.setDefaultMessageNotifications(data.default_message_notifications).catch(() => {});

    if (Array.isArray(data.roles)) {
      for (const r of data.roles) {
        if (!r.name || r.name === "@everyone") continue;
        try {
          await guild.roles.create({ name: String(r.name), colors: { primaryColor: r.color ?? 0 }, hoist: r.hoist ?? false, permissions: r.permissions ?? [] });
        } catch {}
      }
    }

    if (Array.isArray(data.channels)) {
      for (const c of data.channels) {
        try {
          if (c.type === 4) await guild.channels.create({ name: String(c.name), type: 4 });
          else if (c.type === 2) await guild.channels.create({ name: String(c.name), type: 2 });
          else await guild.channels.create({ name: String(c.name), type: 0 });
        } catch {}
      }
    }

    aud(guild.id, interaction.user.id, ACT.IMPORT_GUILD, `<@${interaction.user.id}> imported guild data on this server`);
    await interaction.editReply({
      components: [st("Success", gr, "Successfully **imported** the server data.")],
    });
  } catch (err) {
    console.error("[import] failed", err);
    await interaction.editReply({
      components: [st("Error", rd, "Failed to import the file. Make sure it follows the official Discord API format for guild data.")],
    });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId !== "backup-import:menu" || !interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];
  if (action !== "guild") return;

  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    await interaction.update({ components: [st("Error", rd, "This command must be used in a text channel.")] });
    return;
  }

  await interaction.update({
    components: [st("Import", bl, "**Envoie le fichier JSON** dans ce salon dans les 60 prochaines secondes.")],
  });

  try {
    const collected = await (channel as any).awaitMessages({
      filter: (m: any) => m.author.id === interaction.user.id && m.attachments.size > 0,
      max: 1,
      time: 60000,
      errors: ["time"],
    });
    const msg = collected.first();
    const file = msg?.attachments.first();
    if (!file) {
      await interaction.editReply({ components: [st("Error", rd, "No file received.")] });
      return;
    }
    await interaction.editReply({ components: [st("Creating backup ...", bl, "Importing server data...")] });
    await doImport(interaction, file.url);
  } catch {
    await interaction.editReply({ components: [st("Error", rd, "Temps écoulé : aucun fichier reçu.")] }).catch(() => {});
  }
}
