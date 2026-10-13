import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, AutocompleteInteraction } from "discord.js";
import { row, btn, st, V2E } from "../../func/ui.ts";
import { ownAdd, ownList, ownDel, aud, ACT } from "../../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("chatlog")
  .setDescription("Create, load and manage your channel chatlogs")
  .setDefaultMemberPermissions(8)
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Create a chatlog of this channel")
      .addIntegerOption((o) => o.setName("message_count").setDescription("The count of messages to save").setRequired(false))
      .addStringOption((o) => o.setName("before").setDescription("The id of a message or chatlog").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("load")
      .setDescription("Load a previously created chatlog in this channel")
      .addStringOption((o) => o.setName("chatlog_id").setDescription("No description").setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) => o.setName("message_count").setDescription("No description").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("info")
      .setDescription("Get information about a previously created chatlog")
      .addStringOption((o) => o.setName("chatlog_id").setDescription("No description").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("Get a list of all your previously created chatlogs")
      .addIntegerOption((o) => o.setName("page").setDescription("The page to display (default 1)").setRequired(false))
      .addStringOption((o) => o.setName("master_key").setDescription("No description").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("delete")
      .setDescription("Delete one of your previously created chatlogs")
      .addStringOption((o) => o.setName("chatlog_id").setDescription("No description").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand((s) =>
    s
      .setName("purge")
      .setDescription("Delete all your previously created chatlogs")
      .addStringOption((o) =>
        o
          .setName("older_than")
          .setDescription("Only chatlogs that are older than this will be deleted")
          .setRequired(false)
          .addChoices(
            { name: "24 hours", value: "24h" },
            { name: "2 days", value: "2d" },
            { name: "3 days", value: "3d" },
            { name: "7 days", value: "7d" },
            { name: "14 days", value: "14d" },
            { name: "30 days", value: "30d" }
          )
      )
  );

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const pendPurge = new Map<string, string[]>();

async function save(userId: string, id: string, messages: string[]): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.resolve(import.meta.dir, "../../../../../data/userdata");
  await mkdir(dir, { recursive: true });
  const d = { id, name: "Chatlog", messages, createdTimestamp: Date.now() };
  await writeFile(path.join(dir, `${id}.json`), JSON.stringify(d), "utf8");
  ownAdd(userId, id);
}

async function get(userId: string, id: string): Promise<{ messages: string[]; createdTimestamp: number } | null> {
  if (!ownList(userId).includes(id)) return null;
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.resolve(import.meta.dir, "../../../../../data/userdata", `${id}.json`);
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function del(userId: string, id: string): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  const path = await import("node:path");
  await unlink(path.resolve(import.meta.dir, "../../../../../data/userdata", `${id}.json`)).catch(() => {});
  ownDel(userId, id);
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = interaction.options.getFocused().toLowerCase();
  const ids = ownList(interaction.user.id)
    .filter((id) => id.toLowerCase().includes(q) && id.startsWith("chatlog-"))
    .slice(0, 25);
  await interaction.respond(ids.map((id) => ({ name: id, value: id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ components: [st("Error", rd, "This command must be used in a text channel.")], flags: V2E });
    return;
  }
  const uid = interaction.user.id;

  if (sub === "create") {
    const max = interaction.options.getInteger("message_count") ?? 1000;
    const before = interaction.options.getString("before");
    await interaction.deferReply({ flags: V2E });
    const id = `chatlog-${Date.now()}`;
    let msgs: string[] = [];
    if (max > 0) {
      const opts: any = { limit: Math.min(max, 100), before: before || undefined };
      const fetched = await (channel as any).messages.fetch(opts);
      for (const m of fetched.values()) msgs.push(m.content ?? "");
    }
    await save(uid, id, msgs);
    aud(interaction.guild?.id ?? "", uid, ACT.CHATLOG_CREATE, `<@${uid}> created a chatlog in this server`);
    await interaction.editReply({
      components: [st("Success", gr, `Successfully **created chatlog** with the id \`${id}\`.\n\n**Usage**\n\`\`\`/chatlog load chatlog_id: ${id}\`\`\``)],
      flags: V2E,
    });
    return;
  }

  if (sub === "list") {
    const page = interaction.options.getInteger("page") ?? 1;
    const ids = ownList(uid).filter((x) => x.startsWith("chatlog-"));
    if (ids.length === 0) {
      await interaction.reply({ components: [st("Error", rd, "There are **no chatlogs** yet.")], flags: V2E });
      return;
    }
    const per = 10;
    const totalP = Math.max(1, Math.ceil(ids.length / per));
    const cur = Math.min(Math.max(1, page), totalP);
    const pageIds = ids.slice((cur - 1) * per, cur * per);
    const blocks = [
      st("Chatlog List", bl, `Displaying **${(cur - 1) * per + 1}** - **${Math.min(cur * per, ids.length)}** of **${ids.length}** total chatlogs`),
    ];
    await interaction.reply({ components: blocks, flags: V2E });
    return;
  }

  if (sub === "load") {
    const id = interaction.options.getString("chatlog_id")!;
    const cl = await get(uid, id);
    if (!cl) {
      await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Warning", og, "Loading this chatlog will send the saved messages into this channel. **This cannot be undone.**", row(btn(`chatlog:load_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`chatlog:load_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
      flags: V2E,
    });
    return;
  }

  if (sub === "info") {
    const id = interaction.options.getString("chatlog_id")!;
    const cl = await get(uid, id);
    if (!cl) {
      await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Chatlog Info", bl, `**ID:** \`${id}\`\n**Messages:** \`${cl.messages.length}\`\n**Created At:** <t:${Math.floor(cl.createdTimestamp / 1000)}:R>`)],
      flags: V2E,
    });
    return;
  }

  if (sub === "delete") {
    const id = interaction.options.getString("chatlog_id")!;
    const cl = await get(uid, id);
    if (!cl) {
      await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Warning", og, "Are you sure that you want to delete this chatlog? **This can not be undone**.", row(btn(`chatlog:delete_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`chatlog:delete_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
      flags: V2E,
    });
    return;
  }

  if (sub === "purge") {
    const olderThan = interaction.options.getString("older_than");
    const ids = ownList(uid).filter((x) => x.startsWith("chatlog-"));
    let target = ids;
    if (olderThan) {
      const mult: Record<string, number> = { h: 3600000, d: 86400000 };
      const m = /^(\d+)([hd])$/.exec(olderThan);
      if (m) {
        const ms = Number(m[1]) * mult[m[2] as keyof typeof mult]!;
        const cutoff = Date.now() - ms;
        const filtered: string[] = [];
        for (const id of ids) {
          const cl = await get(uid, id);
          if (cl && cl.createdTimestamp < cutoff) filtered.push(id);
        }
        target = filtered;
      }
    }
    if (target.length === 0) {
      await interaction.reply({ components: [st("Error", rd, "There are **no chatlogs** to delete.")], flags: V2E });
      return;
    }
    await interaction.reply({
      components: [st("Warning", og, `Are you sure that you want to delete **${target.length}** chatlog(s)? **This can not be undone.**`, row(btn("chatlog:purge_confirm", "Confirm", ButtonStyle.Success), btn("chatlog:purge_cancel", "Cancel", ButtonStyle.Danger)))],
      flags: V2E,
    });
    pendPurge.set(uid, target);
  }
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const [action, payload = ""] = interaction.customId.split("?");
  const id = payload.startsWith("chatlog:") ? payload.slice("chatlog:".length) : payload;
  const uid = interaction.user.id;

  if (action === "chatlog:load_confirm") {
    const cl = await get(uid, id);
    if (!cl) {
      await interaction.update({ components: [st("Error", rd, "Chatlog not found.")] });
      return;
    }
    aud(interaction.guild?.id ?? "", uid, ACT.CHATLOG_LOAD, `<@${uid}> loaded a chatlog in this server`);
    await interaction.update({ components: [st("Info", bl, "Loading chatlog...")] });
    const target = interaction.channel;
    if ((target as any)?.isTextBased?.()) {
      for (const m of cl.messages) {
        await (target as any).send(m).catch(() => {});
      }
    }
    await interaction.editReply({ components: [st("Success", gr, "Successfully **loaded chatlog**.")], flags: V2E });
    return;
  }
  if (action === "chatlog:load_cancel") {
    await interaction.update({ components: [st("Info", bl, "Chatlog loading cancelled.")] });
    return;
  }
  if (action === "chatlog:delete_confirm") {
    await del(uid, id);
    await interaction.update({ components: [st("Success", gr, "Successfully **deleted chatlog**.")] });
    return;
  }
  if (action === "chatlog:delete_cancel") {
    await interaction.update({ components: [st("Info", bl, "Chatlog has not been deleted.")] });
    return;
  }
  if (action === "chatlog:purge_confirm") {
    const ids = (pendPurge.get(uid) ?? []).filter((x) => ownList(uid).includes(x));
    pendPurge.delete(uid);
    for (const chatId of ids) await del(uid, chatId);
    await interaction.update({ components: [st("Success", gr, `Successfully **deleted** \`${ids.length}\` chatlog(s).`)] });
    return;
  }
  if (action === "chatlog:purge_cancel") {
    pendPurge.delete(uid);
    await interaction.update({ components: [st("Info", bl, "The chatlog(s) have not been deleted.")] });
  }
}
