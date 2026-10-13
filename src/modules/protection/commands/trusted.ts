import {
  ActionRowBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  MessageComponentInteraction,
  User,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  actionRow,
  button,
  msgPanel,
  panel,
  sepBlock,
  textBlock,
} from "../../../core/ui.ts";
import { addWhitelist, getWhitelist, removeWhitelist } from "../func/db.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("trusted")
  .setDescription("Gérer la liste blanche du serveur (ignorée par l'anti-raid).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) =>
    s
      .setName("ajouter")
      .setDescription("Ajouter un utilisateur à la liste blanche.")
      .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur à ajouter.").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("retirer")
      .setDescription("Retirer un utilisateur de la liste blanche.")
      .addUserOption((o) => o.setName("utilisateur").setDescription("Utilisateur à retirer.").setRequired(true))
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Afficher la liste blanche."));

const CMD = "trusted";

function canManage(guild: Guild, interaction: ChatInputCommandInteraction | MessageComponentInteraction): boolean {
  if (guild.ownerId === interaction.user.id) return true;
  const perms = interaction.memberPermissions;
  return perms?.has(PermissionFlagsBits.Administrator) ?? false;
}

async function loadUsers(interaction: ChatInputCommandInteraction | MessageComponentInteraction, guild: Guild) {
  const ids = getWhitelist(guild.id);
  const users: User[] = [];
  const bots: User[] = [];
  for (const id of ids) {
    const u = await interaction.client.users.fetch(id).catch(() => null);
    if (!u) continue;
    if (u.bot) bots.push(u);
    else users.push(u);
  }
  return { users, bots };
}

async function listPayload(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  guild: Guild
) {
  const owner = await guild.fetchOwner().catch(() => null);
  const { users, bots } = await loadUsers(interaction, guild);
  const usersValue =
    users.length
      ? users.map((u) => `> ${u} — \`@${u.username}\``).join("\n")
      : "> *Aucun utilisateur*";
  const botsValue =
    bots.length ? bots.map((b) => `> ${b} — \`${b.tag}\``).join("\n") : "> *Aucun robot*";
  const body = panel(
    [
      textBlock(
        `# 🤝 Liste blanche\nVoici les utilisateurs et robots ignorés par l'anti-raid sur **${guild.name}**.`
      ),
      sepBlock(),
      textBlock(`**👑 Propriétaire**\n> ${owner ? `${owner.user} — \`@${owner.user.username}\`` : "*inconnu*"}`),
      sepBlock(),
      textBlock(`**👤 Utilisateurs (${users.length})**\n${usersValue}`),
      sepBlock(),
      textBlock(`**🤖 Robots (${bots.length})**\n${botsValue}`),
      sepBlock(),
      textBlock(
        "⚠️ *N'ajoutez que des personnes de confiance : la liste blanche donne accès aux commandes réservées au propriétaire.*"
      ),
    ],
    BLURPLE
  );
  const row = actionRow(
    button(`${CMD}:add`, "Ajouter", ButtonStyle.Success, "➕"),
    button(`${CMD}:remove`, "Retirer", ButtonStyle.Danger, "➖")
  );
  return { components: [body, row], flags: FLAGS_V2 };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!canManage(guild, interaction)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou administrateur.");
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "liste") {
    await interaction.reply(await listPayload(interaction, guild));
    return;
  }

  const user = interaction.options.getUser("utilisateur", true);
  if (sub === "ajouter") {
    if (user.id === guild.ownerId) {
      await replyErr(interaction, "❌ Le propriétaire du serveur est déjà implicitement dans la liste blanche.");
      return;
    }
    const before = getWhitelist(guild.id);
    if (before.includes(user.id)) {
      await interaction.reply({
        components: [msgPanel(`ℹ️ ${user} est déjà dans la liste blanche.`, BLURPLE)],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    addWhitelist(guild.id, user.id);
    await interaction.reply({
      components: [msgPanel(`✅ ${user} a été ajouté à la liste blanche.`, BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }

  // retirer
  const wl = getWhitelist(guild.id);
  if (!wl.includes(user.id)) {
    await interaction.reply({
      components: [msgPanel(`ℹ️ ${user} n'est pas dans la liste blanche.`, BLURPLE)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  removeWhitelist(guild.id, user.id);
  await interaction.reply({
    components: [msgPanel(`✅ ${user} a été retiré de la liste blanche.`, BLURPLE)],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (!canManage(guild, interaction)) {
    await replyErr(interaction, "❌ Vous devez être le propriétaire du serveur ou administrateur.");
    return;
  }
  const action = parts[1];

  if (action === "add" && interaction.isButton()) {
    const select = new UserSelectMenuBuilder()
      .setCustomId(`${CMD}:add_select`)
      .setPlaceholder("Utilisateurs à ajouter à la liste blanche")
      .setMinValues(1)
      .setMaxValues(10);
    const body = panel(
      [textBlock("# ➕ Ajouter à la liste blanche\nSélectionnez les utilisateurs à ajouter.")],
      BLURPLE
    );
    await interaction.update({
      components: [body, new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
      flags: FLAGS_V2,
    });
    return;
  }

  if (action === "add_select" && interaction.isUserSelectMenu()) {
    const added: string[] = [];
    for (const [id, user] of interaction.users) {
      if (id === guild.ownerId) continue;
      if (!getWhitelist(guild.id).includes(id)) {
        addWhitelist(guild.id, id);
        added.push(`${user}`);
      }
    }
    await interaction.update(await listPayload(interaction, guild));
    if (added.length) {
      await interaction.followUp({
        components: [msgPanel(`✅ Ajouté(s) à la liste blanche : ${added.join(", ")}`, BLURPLE)],
        flags: FLAGS_V2_EPHEMERAL,
      });
    }
    return;
  }

  if (action === "remove" && interaction.isButton()) {
    const wl = getWhitelist(guild.id);
    if (!wl.length) {
      await replyErr(interaction, "❌ La liste blanche est vide.");
      return;
    }
    const options = [];
    for (const id of wl.slice(0, 25)) {
      const u = await interaction.client.users.fetch(id).catch(() => null);
      options.push({
        label: u ? `@${u.username}${u.bot ? " [BOT]" : ""}` : `ID ${id}`,
        value: id,
      });
    }
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${CMD}:remove_select`)
      .setPlaceholder("Utilisateurs à retirer de la liste blanche")
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options);
    const body = panel(
      [textBlock("# ➖ Retirer de la liste blanche\nSélectionnez les utilisateurs à retirer.")],
      BLURPLE
    );
    await interaction.update({
      components: [body, new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
      flags: FLAGS_V2,
    });
    return;
  }

  if (action === "remove_select" && interaction.isStringSelectMenu()) {
    for (const id of interaction.values) removeWhitelist(guild.id, id);
    await interaction.update(await listPayload(interaction, guild));
    await interaction.followUp({
      components: [msgPanel(`✅ ${interaction.values.length} utilisateur(s) retiré(s) de la liste blanche.`, BLURPLE)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
}
