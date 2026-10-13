import { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, RoleSelectMenuBuilder, ChannelType, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { syAdd, syDel, syList, aud, ACT } from "../../func/db.ts";
import { st, panel, tx, V2E, type Blk } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("sync")
  .setDescription("Synchroniser messages, bannissements et rôles")
  .setDefaultMemberPermissions(8);

const gr = 0x5bd57b;
const rd = 0xc63a35;

const DIRECTIONS = ["from", "to", "both"] as const;

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("sync:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Sync messages")
        .setValue("messages")
        .setDescription("Synchroniser les messages entre deux salons")
        .setEmoji("💬"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Sync bannissements")
        .setValue("bans")
        .setDescription("Synchroniser les bannissements entre deux serveurs")
        .setEmoji("🔨"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Sync rôles")
        .setValue("roles")
        .setDescription("Synchroniser les rôles entre deux serveurs")
        .setEmoji("🎭"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Supprimer une sync")
        .setValue("delete")
        .setDescription("Supprimer une synchronisation existante")
        .setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lister les syncs")
        .setValue("list")
        .setDescription("Voir toutes les synchronisations du serveur")
        .setEmoji("📝")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 🔄 Synchronisation\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function directionSelect(customId: string): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder("Choisis la direction…")
    .addOptions(
      DIRECTIONS.map((d) =>
        new StringSelectMenuOptionBuilder().setLabel(d).setValue(d).setDescription(`Direction : ${d}`)
      )
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🔄 Direction\nDans quel sens synchroniser ?"))
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function openModal(
  interaction: MessageComponentInteraction,
  customId: string,
  title: string,
  fields: { id: string; label: string; required: boolean; placeholder?: string; maxLength?: number }[]
): Promise<void> {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder()
      .setCustomId(f.id)
      .setStyle(TextInputStyle.Short)
      .setRequired(f.required);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    if (f.maxLength) input.setMaxLength(f.maxLength);
    modal.addLabelComponents(new LabelBuilder().setLabel(f.label).setTextInputComponent(input));
  }
  return interaction.showModal(modal);
}

async function doList(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const syncs = syList(guild.id);
  if (syncs.length === 0) {
    await interaction.update({ components: [st("Error", rd, "There are **no syncs** on this server.")] });
    return;
  }
  const blocks: Blk[] = [
    tx("**Sync List**"),
    tx(`Displaying **${syncs.length}** syncs`),
    tx("\u200b"),
    ...syncs.slice(0, 25).map((s) => tx(`**${s.id}** - \`${s.type}\` ${s.direction} -> \`${s.target}\``)),
  ];
  await interaction.update({ components: [panel(blocks)] });
}

async function doDelete(interaction: ModalSubmitInteraction, syncId: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  syDel(syncId);
  aud(guild.id, interaction.user.id, ACT.SYNC_DELETE, `<@${interaction.user.id}> deleted a sync on this server`);
  await interaction.reply({ components: [st("Success", gr, `Successfully **deleted sync** \`${syncId}\`.`)], flags: V2E });
}

async function doCreate(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  type: string,
  direction: string,
  target: string,
  act: number
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!DIRECTIONS.includes(direction as (typeof DIRECTIONS)[number])) {
    const comps = [st("Error", rd, "Invalid direction. Use `from`, `to` or `both`.")];
    if (interaction.isModalSubmit()) await interaction.reply({ components: comps, flags: V2E });
    else await interaction.update({ components: comps });
    return;
  }
  const id = `sync-${Date.now().toString(36)}`;
  syAdd({ id, guild_id: guild.id, user_id: interaction.user.id, type, direction, target, created_at: Date.now() });
  aud(guild.id, interaction.user.id, act, `<@${interaction.user.id}> created a ${type} sync on this server`);
  const comps = [st("Success", gr, `Successfully **created sync** with the id \`${id}\`.`)];
  if (interaction.isModalSubmit()) await interaction.reply({ components: comps, flags: V2E });
  else await interaction.update({ components: comps });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;
  const guild = interaction.guild;
  if (!guild) return;

  // Hub menu
  if (cid === "sync:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "list") {
      await doList(interaction);
      return;
    }
    if (action === "delete") {
      await openModal(interaction, "sync:modal:delete", "Supprimer une sync", [
        { id: "sync_id", label: "ID de la sync", required: true, placeholder: "sync-...", maxLength: 60 },
      ]);
      return;
    }
    if (action === "messages" || action === "bans") {
      await interaction.update({ components: [directionSelect(`sync:dir:${action}`)] });
      return;
    }
    if (action === "roles") {
      const sel = new RoleSelectMenuBuilder()
        .setCustomId("sync:pick_role_a")
        .setPlaceholder("Sélectionne le rôle A…")
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 🎭 Sync rôles\nSélectionne le rôle A (de ce serveur)."))
            .addActionRowComponents(new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    return;
  }

  // Direction picked for messages/bans
  if (cid.startsWith("sync:dir:") && interaction.isStringSelectMenu()) {
    const kind = cid.slice("sync:dir:".length);
    const direction = interaction.values[0]!;
    if (kind === "messages") {
      const sel = new ChannelSelectMenuBuilder()
        .setCustomId(`sync:mchan:${direction}`)
        .setPlaceholder("Sélectionne l'autre salon…")
        .setChannelTypes([ChannelType.GuildText])
        .setMinValues(1)
        .setMaxValues(1);
      await interaction.update({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent("# 💬 Sync messages\nSélectionne l'autre salon à synchroniser."))
            .addActionRowComponents(new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(sel)),
        ],
      });
      return;
    }
    if (kind === "bans") {
      await openModal(interaction, `sync:modal:bans:${direction}`, "Sync bannissements", [
        { id: "guild_id", label: "ID de l'autre serveur", required: true, placeholder: "123456789012345678", maxLength: 30 },
      ]);
      return;
    }
    return;
  }

  // Channel picked for messages sync
  if (cid.startsWith("sync:mchan:") && interaction.isChannelSelectMenu()) {
    const direction = cid.slice("sync:mchan:".length);
    const other = interaction.values[0]!;
    const src = interaction.channel?.id ?? "";
    await doCreate(interaction, "messages", direction, `${src}:${other}`, ACT.MESSAGE_SYNC_CREATE);
    return;
  }

  // Role A picked for roles sync
  if (cid === "sync:pick_role_a" && interaction.isRoleSelectMenu()) {
    const roleA = interaction.values[0]!;
    await openModal(interaction, `sync:modal:roles:${roleA}`, "Sync rôles", [
      { id: "direction", label: "Direction (from / to / both)", required: true, placeholder: "both", maxLength: 10 },
      { id: "server_b", label: "ID du serveur B", required: true, placeholder: "123456789012345678", maxLength: 30 },
      { id: "role_b", label: "ID du rôle B", required: true, placeholder: "123456789012345678", maxLength: 30 },
    ]);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const cid = interaction.customId;

  if (cid === "sync:modal:delete") {
    const syncId = interaction.fields.getTextInputValue("sync_id").trim();
    await doDelete(interaction, syncId);
    return;
  }

  if (cid.startsWith("sync:modal:bans:")) {
    const direction = cid.slice("sync:modal:bans:".length);
    const guildId = interaction.guild!.id;
    const other = interaction.fields.getTextInputValue("guild_id").trim();
    await doCreate(interaction, "bans", direction, `${guildId}:${other}`, ACT.BAN_SYNC_CREATE);
    return;
  }

  if (cid.startsWith("sync:modal:roles:")) {
    const roleA = cid.slice("sync:modal:roles:".length);
    const direction = interaction.fields.getTextInputValue("direction").trim().toLowerCase();
    const serverB = interaction.fields.getTextInputValue("server_b").trim();
    const roleB = interaction.fields.getTextInputValue("role_b").trim();
    await doCreate(interaction, "roles", direction, `${roleA}:${serverB}:${roleB}`, ACT.ROLE_SYNC_CREATE);
    return;
  }
}
