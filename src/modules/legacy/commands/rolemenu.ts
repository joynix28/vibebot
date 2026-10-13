import { SlashCommandBuilder, PermissionFlagsBits, ButtonStyle } from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  GuildMember,
  TextBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  okPanel,
  errPanel,
  panel,
  textBlock,
  actionRow,
  button,
  fieldRaw,
} from "../../../core/ui.ts";
import { createRolemenu, getRolemenu, setRolemenuMessage, deleteRolemenu, listRolemenus } from "../func/db-gestion.ts";

const MAX_ROLES = 20;

export const data = new SlashCommandBuilder()
  .setName("rolemenu")
  .setDescription("Crée des menus de rôles à boutons.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Publie un menu de rôles dans le salon actuel.")
      .addStringOption((o) => o.setName("label").setDescription("Titre du menu.").setRequired(true).setMaxLength(100))
      .addStringOption((o) =>
        o
          .setName("roles")
          .setDescription("Rôles : mentions ou IDs séparés par des espaces (max 20).")
          .setRequired(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Supprime un menu de rôles.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du menu (voir /rolemenu list).").setRequired(true))
  )
  .addSubcommand((s) => s.setName("list").setDescription("Liste les menus de rôles du serveur."));

function buildMenuComponents(menuId: number, label: string, roles: { id: string; name: string }[]): ReturnType<typeof actionRow>[] {
  const rows: ReturnType<typeof actionRow>[] = [];
  let current: ReturnType<typeof button>[] = [];
  for (const role of roles) {
    current.push(button(`rolemenu:toggle:${menuId}:${role.id}`, role.name.slice(0, 80), ButtonStyle.Secondary));
    if (current.length === 5) {
      rows.push(actionRow(...(current.splice(0) as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
    }
  }
  if (current.length > 0) {
    rows.push(actionRow(...(current as [ReturnType<typeof button>, ...ReturnType<typeof button>[]])));
  }
  return rows;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  const channel = interaction.channel;
  if (!guild || !channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon textuel.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const label = interaction.options.getString("label", true);
    const rawRoles = interaction.options.getString("roles", true);
    const ids = [...new Set(rawRoles.match(/\d{17,20}/g) ?? [])].slice(0, MAX_ROLES);
    if (ids.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun rôle valide trouvé. Mentionne des rôles ou colle leurs IDs.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const roles: { id: string; name: string }[] = [];
    for (const id of ids) {
      const role = await guild.roles.fetch(id).catch(() => null);
      if (!role || role.managed) continue;
      roles.push({ id: role.id, name: role.name });
    }
    if (roles.length === 0) {
      await interaction.reply({ components: [errPanel("Aucun de ces rôles n'est attribuable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const menuId = createRolemenu(guild.id, channel.id, label, roles.map((r) => r.id));
    const postChannel = channel as TextBasedChannel;
    if (!postChannel.isSendable()) {
      deleteRolemenu(guild.id, menuId);
      await interaction.reply({ components: [errPanel("Impossible de publier le menu.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const sent = await postChannel
      .send({
        components: [panel([textBlock(`## 🎭 ${label}\n*Clique sur un bouton pour obtenir ou retirer le rôle.*`)], BLUE), ...buildMenuComponents(menuId, label, roles)],
        flags: FLAGS_V2,
      })
      .catch(() => null);
    if (!sent) {
      deleteRolemenu(guild.id, menuId);
      await interaction.reply({ components: [errPanel("Impossible de publier le menu.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    setRolemenuMessage(menuId, sent.id);
    await interaction.reply({
      components: [okPanel(`## ✅ Menu de rôles créé\n${fieldRaw("ID", String(menuId))}\n${fieldRaw("Rôles", roles.map((r) => `<@&${r.id}>`).join(" ") || "—")}`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "delete") {
    const id = interaction.options.getInteger("id", true);
    const menu = getRolemenu(id);
    if (!menu || menu.guild_id !== guild.id) {
      await interaction.reply({ components: [errPanel(`Aucun menu avec l'ID \`${id}\`.` )], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (menu.message_id) {
      const ch = (await guild.channels.fetch(menu.channel_id).catch(() => null)) as TextBasedChannel | null;
      if (ch?.isTextBased()) await ch.messages.delete(menu.message_id).catch(() => {});
    }
    deleteRolemenu(guild.id, id);
    await interaction.reply({ components: [okPanel(`Menu de rôles \`${id}\` supprimé.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // list
  const menus = listRolemenus(guild.id);
  if (menus.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun menu de rôles. Utilise `/rolemenu create`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = menus.map((m) => `\`${m.id}\` — **${m.label}** — ${m.roles.length} rôle(s) — <#${m.channel_id}>`).join("\n");
  await interaction.reply({ components: [panel([textBlock(`## 🎭 Menus de rôles\n${lines}`)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  // rolemenu:toggle:<menuId>:<roleId>
  const parts = interaction.customId.split(":");
  const menuId = Number(parts[2]);
  const roleId = parts[3];
  if (!Number.isInteger(menuId) || !roleId) return;
  const guild = interaction.guild;
  const member = interaction.member as GuildMember | null;
  if (!guild || !member) return;
  const menu = getRolemenu(menuId);
  if (!menu || menu.guild_id !== guild.id || !menu.roles.includes(roleId)) {
    await interaction.reply({ components: [errPanel("Ce menu n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await interaction.reply({ components: [errPanel("Ce rôle n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ components: [okPanel(`Rôle **${role.name}** retiré.`)], flags: FLAGS_V2_EPHEMERAL });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ components: [panel([textBlock(`## ✅ Rôle obtenu\nTu as maintenant le rôle **${role.name}**.`)], GREEN)], flags: FLAGS_V2_EPHEMERAL });
    }
  } catch {
    await interaction.reply({ components: [errPanel("Impossible de modifier tes rôles (hiérarchie ou permissions).")], flags: FLAGS_V2_EPHEMERAL });
  }
}
