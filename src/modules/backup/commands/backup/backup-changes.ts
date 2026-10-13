import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { g, sv, lsChg, type Guild } from "../../func/db.ts";
import { st, panel, tx, V2E, type Blk } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-changes")
  .setDescription("Voir et gérer le suivi des changements du serveur")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup-changes:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Activer le suivi")
        .setValue("enable")
        .setDescription("Active le suivi des changements du serveur")
        .setEmoji("✅"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Désactiver le suivi")
        .setValue("disable")
        .setDescription("Désactive le suivi des changements")
        .setEmoji("🚫"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir les changements")
        .setValue("list")
        .setDescription("Liste les changements récents du serveur")
        .setEmoji("📝")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📝 Suivi des changements\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

async function doEnable(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);
  cfg.xp_keep_roles = 1;
  sv(cfg);
  await interaction.update({ components: [st("Success", gr, "Successfully **enabled change tracking** for this server.")] });
}

async function doDisable(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);
  cfg.xp_keep_roles = 0;
  sv(cfg);
  await interaction.update({ components: [st("Success", gr, "Successfully **disabled change logging** for this server.")] });
}

async function doList(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const changes = lsChg(guild.id);
  if (changes.length === 0) {
    await interaction.update({ components: [st("Info", bl, "There are **no recent changes** to display.")] });
    return;
  }
  const blocks: Blk[] = [
    tx("**Recent Changes**"),
    tx(`Displaying **${changes.length}** change(s)`),
    tx("\u200b"),
    ...changes.map((c) => tx(`<t:${Math.floor(c.created_at / 1000)}:R> - ${c.description}`)),
  ];
  await interaction.update({ components: [panel(blocks)] });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId === "backup-changes:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "enable") await doEnable(interaction);
    else if (action === "disable") await doDisable(interaction);
    else if (action === "list") await doList(interaction);
  }
}
