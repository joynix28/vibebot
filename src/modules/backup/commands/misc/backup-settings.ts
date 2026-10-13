import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { g, setPermLvl, type Guild } from "../../func/db.ts";
import { st, V2E } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-settings")
  .setDescription("Gérer les paramètres du serveur")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;

const LVL: Record<string, string> = {
  all: "Admins can use all commands",
  safe: "Admins can not take destructive actions",
  owner: "Only the owner can use the relevant commands",
};

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup-settings:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Permissions")
        .setValue("permissions")
        .setDescription("Qui peut créer/charger backups, syncs et chatlogs")
        .setEmoji("🔐"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir les paramètres")
        .setValue("show")
        .setDescription("Affiche les paramètres actuels")
        .setEmoji("ℹ️")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# ⚙️ Paramètres backups\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

async function doShow(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const cfg: Guild = g(guild.id);
  void cfg;
  await interaction.update({
    components: [st("Server Settings", bl, "Manage who is able to create backups, syncs & chatlogs and load backups, chatlogs & templates. This does not affect basic commands like `/ping`.")],
  });
}

async function doSetLevel(interaction: MessageComponentInteraction, lvl: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  setPermLvl(guild.id, lvl);
  await interaction.update({
    components: [st("Success", gr, `Successfully **updated the permissions** for this server.\n\n**New level:** ${LVL[lvl] ?? lvl}`)],
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  if (cid === "backup-settings:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "show") {
      await doShow(interaction);
      return;
    }
    if (action === "permissions") {
      const sel = new StringSelectMenuBuilder()
        .setCustomId("backup-settings:level")
        .setPlaceholder("Choisis le niveau de permission…")
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("Admins : tout").setValue("all").setDescription(LVL["all"] ?? "all").setEmoji("✅"),
          new StringSelectMenuOptionBuilder().setLabel("Admins : sans destruction").setValue("safe").setDescription(LVL["safe"] ?? "safe").setEmoji("🛡️"),
          new StringSelectMenuOptionBuilder().setLabel("Propriétaire uniquement").setValue("owner").setDescription(LVL["owner"] ?? "owner").setEmoji("👑")
        );
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🔐 Niveau de permission\nQui peut utiliser les commandes de backup ?"))
            .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    return;
  }

  if (cid === "backup-settings:level" && interaction.isStringSelectMenu()) {
    const lvl = interaction.values[0]!;
    if (!["all", "safe", "owner"].includes(lvl)) {
      await interaction.update({ components: [st("Error", 0xc63a35, "Invalid level.")], flags: V2E });
      return;
    }
    await doSetLevel(interaction, lvl);
    return;
  }
}
