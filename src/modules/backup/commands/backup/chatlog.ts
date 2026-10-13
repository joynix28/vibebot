import { SlashCommandBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ContainerBuilder, TextDisplayBuilder, ModalBuilder, LabelBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, ModalSubmitInteraction, AutocompleteInteraction } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { row, btn, st, V2E } from "../../func/ui.ts";
import { ownAdd, ownList, ownDel, aud, ACT } from "../../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("chatlog")
  .setDescription("Créer et gérer les chatlogs du salon")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;
const gr = 0x5bd57b;
const rd = 0xc63a35;
const og = 0xe8a130;

const pendPurge = new Map<string, string[]>();

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("chatlog:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Créer").setValue("create").setDescription("Crée un chatlog de ce salon").setEmoji("📝"),
      new StringSelectMenuOptionBuilder().setLabel("Charger").setValue("load").setDescription("Rejoue un chatlog dans ce salon").setEmoji("📥"),
      new StringSelectMenuOptionBuilder().setLabel("Infos").setValue("info").setDescription("Détails d'un chatlog").setEmoji("ℹ️"),
      new StringSelectMenuOptionBuilder().setLabel("Liste").setValue("list").setDescription("Voir tous tes chatlogs").setEmoji("📋"),
      new StringSelectMenuOptionBuilder().setLabel("Supprimer").setValue("delete").setDescription("Supprime un chatlog").setEmoji("🗑️"),
      new StringSelectMenuOptionBuilder().setLabel("Tout purger").setValue("purge").setDescription("Supprime tous tes chatlogs").setEmoji("🧹")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📝 Chatlogs\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function openModal(
  interaction: MessageComponentInteraction,
  customId: string,
  title: string,
  fields: { id: string; label: string; required: boolean; placeholder?: string }[]
): Promise<void> {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setStyle(TextInputStyle.Short).setRequired(f.required).setMaxLength(200);
    if (f.placeholder) input.setPlaceholder(f.placeholder);
    modal.addLabelComponents(new LabelBuilder().setLabel(f.label).setTextInputComponent(input));
  }
  return interaction.showModal(modal);
}

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

async function replyUpdate(interaction: MessageComponentInteraction, comps: any[]): Promise<void> {
  if (interaction.deferred || interaction.replied) await interaction.editReply({ components: comps });
  else await interaction.update({ components: comps });
}

async function doCreate(interaction: MessageComponentInteraction): Promise<void> {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased()) {
    await replyUpdate(interaction, [st("Error", rd, "This command must be used in a text channel.")]);
    return;
  }
  const uid = interaction.user.id;
  const max = 1000;
  await interaction.deferUpdate();
  const id = `chatlog-${Date.now()}`;
  let msgs: string[] = [];
  if (max > 0) {
    const opts: any = { limit: Math.min(max, 100) };
    const fetched = await (channel as any).messages.fetch(opts);
    for (const m of fetched.values()) msgs.push(m.content ?? "");
  }
  await save(uid, id, msgs);
  aud(interaction.guild?.id ?? "", uid, ACT.CHATLOG_CREATE, `<@${uid}> created a chatlog in this server`);
  await interaction.editReply({
    components: [st("Success", gr, `Successfully **created chatlog** with the id \`${id}\`.`)],
  });
}

async function doList(interaction: MessageComponentInteraction): Promise<void> {
  const uid = interaction.user.id;
  const ids = ownList(uid).filter((x) => x.startsWith("chatlog-"));
  if (ids.length === 0) {
    await replyUpdate(interaction, [st("Error", rd, "There are **no chatlogs** yet.")]);
    return;
  }
  const per = 10;
  const cur = 1;
  const blocks = [
    st("Chatlog List", bl, `Displaying **1** - **${Math.min(per, ids.length)}** of **${ids.length}** total chatlogs`),
  ];
  await replyUpdate(interaction, blocks);
}

async function doLoadPrompt(interaction: ModalSubmitInteraction, id: string): Promise<void> {
  const uid = interaction.user.id;
  const cl = await get(uid, id);
  if (!cl) {
    await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
    return;
  }
  await interaction.reply({
    components: [st("Warning", og, "Loading this chatlog will send the saved messages into this channel. **This cannot be undone.**", row(btn(`chatlog:load_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`chatlog:load_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
    flags: V2E,
  });
}

async function doInfo(interaction: ModalSubmitInteraction, id: string): Promise<void> {
  const uid = interaction.user.id;
  const cl = await get(uid, id);
  if (!cl) {
    await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
    return;
  }
  await interaction.reply({
    components: [st("Chatlog Info", bl, `**ID:** \`${id}\`\n**Messages:** \`${cl.messages.length}\`\n**Created At:** <t:${Math.floor(cl.createdTimestamp / 1000)}:R>`)],
    flags: V2E,
  });
}

async function doDeletePrompt(interaction: ModalSubmitInteraction, id: string): Promise<void> {
  const uid = interaction.user.id;
  const cl = await get(uid, id);
  if (!cl) {
    await interaction.reply({ components: [st("Error", rd, `No chatlog found for \`${id}\`!`)], flags: V2E });
    return;
  }
  await interaction.reply({
    components: [st("Warning", og, "Are you sure that you want to delete this chatlog? **This can not be undone**.", row(btn(`chatlog:delete_confirm?${id}`, "Confirm", ButtonStyle.Success), btn(`chatlog:delete_cancel?${id}`, "Cancel", ButtonStyle.Danger)))],
    flags: V2E,
  });
}

async function doPurge(interaction: MessageComponentInteraction): Promise<void> {
  const uid = interaction.user.id;
  const ids = ownList(uid).filter((x) => x.startsWith("chatlog-"));
  if (ids.length === 0) {
    await replyUpdate(interaction, [st("Error", rd, "There are **no chatlogs** to delete.")]);
    return;
  }
  await replyUpdate(interaction, [
    st("Warning", og, `Are you sure that you want to delete **${ids.length}** chatlog(s)? **This can not be undone.**`, row(btn("chatlog:purge_confirm", "Confirm", ButtonStyle.Success), btn("chatlog:purge_cancel", "Cancel", ButtonStyle.Danger))),
  ]);
  pendPurge.set(uid, ids);
}

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = interaction.options.getFocused().toLowerCase();
  const ids = ownList(interaction.user.id)
    .filter((id) => id.toLowerCase().includes(q) && id.startsWith("chatlog-"))
    .slice(0, 25);
  await interaction.respond(ids.map((id) => ({ name: id, value: id })));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  // Hub menu
  if (cid === "chatlog:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "create") {
      await doCreate(interaction);
      return;
    }
    if (action === "list") {
      await doList(interaction);
      return;
    }
    if (action === "purge") {
      await doPurge(interaction);
      return;
    }
    if (action === "load") {
      await openModal(interaction, "chatlog:modal:load", "Charger un chatlog", [
        { id: "chatlog_id", label: "ID du chatlog", required: true, placeholder: "chatlog-..." },
      ]);
      return;
    }
    if (action === "info") {
      await openModal(interaction, "chatlog:modal:info", "Infos chatlog", [
        { id: "chatlog_id", label: "ID du chatlog", required: true, placeholder: "chatlog-..." },
      ]);
      return;
    }
    if (action === "delete") {
      await openModal(interaction, "chatlog:modal:delete", "Supprimer un chatlog", [
        { id: "chatlog_id", label: "ID du chatlog", required: true, placeholder: "chatlog-..." },
      ]);
      return;
    }
    return;
  }

  const [action, payload = ""] = cid.split("?");
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

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const cid = interaction.customId;
  if (cid === "chatlog:modal:load") {
    await doLoadPrompt(interaction, interaction.fields.getTextInputValue("chatlog_id").trim());
    return;
  }
  if (cid === "chatlog:modal:info") {
    await doInfo(interaction, interaction.fields.getTextInputValue("chatlog_id").trim());
    return;
  }
  if (cid === "chatlog:modal:delete") {
    await doDeletePrompt(interaction, interaction.fields.getTextInputValue("chatlog_id").trim());
    return;
  }
}
