import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { syAdd, syDel, syList, aud, ACT } from "../../func/db.ts";
import { st, panel, tx, V2E, type Blk } from "../../func/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("sync")
  .setDescription("Sync messages, bans and roles between channels and servers")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("messages")
      .setDescription("Create a message sync between two channels")
      .addStringOption((o) => o.setName("direction").setDescription("The direction for the sync").setRequired(true).addChoices({ name: "from", value: "from" }, { name: "to", value: "to" }, { name: "both", value: "both" }))
      .addChannelOption((o) => o.setName("channel").setDescription("The other channel to sync with").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("bans")
      .setDescription("Create a ban sync between two servers")
      .addStringOption((o) => o.setName("direction").setDescription("The direction for the sync").setRequired(true).addChoices({ name: "from", value: "from" }, { name: "to", value: "to" }, { name: "both", value: "both" }))
      .addStringOption((o) => o.setName("guild_id").setDescription("The id of the other guild").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("roles")
      .setDescription("Create a role sync between two roles")
      .addRoleOption((o) => o.setName("role_a").setDescription("The id of role A").setRequired(true))
      .addStringOption((o) => o.setName("direction").setDescription("The direction for the sync").setRequired(true).addChoices({ name: "from", value: "from" }, { name: "to", value: "to" }, { name: "both", value: "both" }))
      .addStringOption((o) => o.setName("server_b").setDescription("The id of the server that role B belongs to").setRequired(true))
      .addStringOption((o) => o.setName("role_b").setDescription("The id of role B").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Delete a sync")
      .addStringOption((o) => o.setName("sync_id").setDescription("The id of the sync you want to delete").setRequired(true))
  )
  .addSubcommand((s) => s.setName("list").setDescription("List all your syncs"));

const gr = 0x5bd57b;
const rd = 0xc63a35;
const bl = 0x4a9fe0;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return;

  if (sub === "list") {
    const syncs = syList(guild.id);
    if (syncs.length === 0) {
      await interaction.reply({ components: [st("Error", rd, "There are **no syncs** on this server.")], flags: V2E });
      return;
    }
    const blocks: Blk[] = [
      tx("**Sync List**"),
      tx(`Displaying **${syncs.length}** syncs`),
      tx("\u200b"),
      ...syncs.slice(0, 25).map((s) => tx(`**${s.id}** - \`${s.type}\` ${s.direction} -> \`${s.target}\``)),
    ];
    await interaction.reply({ components: [panel(blocks)], flags: V2E });
    return;
  }

  if (sub === "delete") {
    const id = interaction.options.getString("sync_id")!;
    syDel(id);
    aud(guild.id, interaction.user.id, ACT.SYNC_DELETE, `<@${interaction.user.id}> deleted a sync on this server`);
    await interaction.reply({ components: [st("Success", gr, `Successfully **deleted sync** \`${id}\`.`)], flags: V2E });
    return;
  }

  const direction = interaction.options.getString("direction")!;
  const id = `sync-${Date.now().toString(36)}`;

  let at: number = ACT.MESSAGE_SYNC_CREATE;
  let target = "";
  if (sub === "messages") {
    const src = interaction.channel?.id ?? "";
    const other = interaction.options.getChannel("channel")!.id;
    target = `${src}:${other}`;
  } else if (sub === "bans") {
    target = `${guild.id}:${interaction.options.getString("guild_id")}`;
    at = ACT.BAN_SYNC_CREATE;
  } else if (sub === "roles") {
    const roleA = interaction.options.getRole("role_a")!.id;
    const serverB = interaction.options.getString("server_b")!;
    const roleB = interaction.options.getString("role_b")!;
    target = `${roleA}:${serverB}:${roleB}`;
    at = ACT.ROLE_SYNC_CREATE;
  }
  syAdd({ id, guild_id: guild.id, user_id: interaction.user.id, type: sub, direction, target, created_at: Date.now() });
  aud(guild.id, interaction.user.id, at, `<@${interaction.user.id}> created a ${sub} sync on this server`);

  await interaction.reply({ components: [st("Success", gr, `Successfully **created sync** with the id \`${id}\`.`)], flags: V2E });
}
