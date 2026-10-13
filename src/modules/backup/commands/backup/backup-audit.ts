import { SlashCommandBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ContainerBuilder, TextDisplayBuilder } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction, MessageActionRowComponentBuilder } from "discord.js";
import { ACCENT, FLAGS_V2_EPHEMERAL } from "../../../../core/ui.ts";
import { row, btn, panelWith, tx, V2E, type Blk } from "../../func/ui.ts";
import { alList, alCnt } from "../../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("backup-audit")
  .setDescription("Voir les actions récentes effectuées sur ce serveur")
  .setDefaultMemberPermissions(8);

const bl = 0x4a9fe0;

const F = [
  { label: "Backup Create", value: "0" },
  { label: "Backup Load", value: "1" },
  { label: "Backup Interval Enable", value: "2" },
  { label: "Backup Interval Disable", value: "3" },
  { label: "Template Load", value: "4" },
  { label: "Copy", value: "5" },
  { label: "Chatlog Create", value: "6" },
  { label: "Chatlog Load", value: "7" },
  { label: "Message Sync Create", value: "8" },
  { label: "Ban Sync Create", value: "9" },
  { label: "Sync Delete", value: "10" },
  { label: "Role Sync Create", value: "11" },
  { label: "Backup Sync Create", value: "12" },
  { label: "Import Guild", value: "13" },
];

function hubPanel(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("backup-audit:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir les logs")
        .setValue("logs")
        .setDescription("Liste des actions récentes sur le serveur")
        .setEmoji("📋")
    );
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 📋 Audit des backups\nChoisis une action dans le menu ci-dessous.")
    )
    .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

function mask2arr(mask: number): number[] {
  return F.map((o) => Number(o.value)).filter((n) => (mask & (1 << n)) !== 0);
}

function fSel(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const sel = new StringSelectMenuBuilder()
    .setCustomId("backup-audit:audit_logs_filter")
    .setPlaceholder("Filter by action type")
    .setMinValues(1)
    .setMaxValues(F.length)
    .addOptions(F.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDefault(true)));
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(sel);
}

async function render(interaction: ChatInputCommandInteraction | MessageComponentInteraction, page: number, mask: number): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const acts = mask2arr(mask);
  const per = 10;
  const total = alCnt(guild.id, acts);
  const totalP = Math.max(1, Math.ceil(total / per));
  const cur = Math.min(Math.max(1, page), totalP);
  const logs = alList(guild.id, acts, per, (cur - 1) * per);

  const lines: string[] = [];
  if (logs.length === 0) {
    lines.push(`Displaying **0** - **0** of **0** total entries`);
  } else {
    lines.push(`Displaying **${total === 0 ? 0 : (cur - 1) * per + 1}** - **${Math.min(cur * per, total)}** of **${total}** total entries`);
    for (const log of logs) {
      const name = F[log.action]?.label ?? `Action ${log.action}`;
      lines.push(`**<t:${Math.floor(log.created_at / 1000)}:R> - *${name}***\n${log.description}`);
    }
  }

  const blocks: Blk[] = [tx("**Audit Logs**"), tx(lines[0] ?? ""), tx("\u200b"), ...lines.slice(1).map((l) => tx(l))];

  const nav = row(
    btn(`backup-audit:audit_logs?${cur - 1}&${mask}`, "Previous Page", ButtonStyle.Primary, undefined, cur <= 1),
    btn(`backup-audit:audit_logs?${cur + 1}&${mask}`, "Next Page", ButtonStyle.Primary, undefined, cur >= totalP)
  );

  const comps = [panelWith(blocks, fSel(), nav)];
  if (interaction.isChatInputCommand()) {
    await interaction.reply({ components: comps, flags: V2E });
  } else {
    await interaction.update({ components: comps });
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ components: [hubPanel()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const cid = interaction.customId;

  if (cid === "backup-audit:menu" && interaction.isStringSelectMenu()) {
    const action = interaction.values[0];
    if (action === "logs") {
      await render(interaction, 1, 16383);
    }
    return;
  }

  if (cid.startsWith("backup-audit:audit_logs_filter") && interaction.isStringSelectMenu()) {
    const mask = interaction.values.reduce((acc, v) => acc | (1 << Number(v)), 0);
    await render(interaction, 1, mask);
    return;
  }

  if (cid.startsWith("backup-audit:audit_logs?") && interaction.isButton()) {
    const [, rawPage, rawMask] = cid.split("?")[1]!.split("&");
    await render(interaction, Number(rawPage), Number(rawMask ?? 16383));
    return;
  }
}
