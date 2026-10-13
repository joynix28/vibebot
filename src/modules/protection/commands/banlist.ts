import { ButtonStyle, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  MessageComponentInteraction,
} from "discord.js";
import { FLAGS_V2, actionRow, button, msgPanel, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, checkAuthor, hasPerm, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("banlist")
  .setDescription("Afficher la liste des utilisateurs bannis du serveur.")
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

const CMD = "banlist";
const PAGE_SIZE = 10;

async function renderPage(guild: Guild, authorId: string, page: number) {
  const bans = await guild.bans.fetch().catch(() => null);
  if (!bans || !bans.size) return null;
  const list = [...bans.values()];
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = list.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  const body = panel(
    [
      textBlock(`# 🔨 Bannissements\n**Nombre de bannissements :** ${list.length}`),
      sepBlock(),
      textBlock(
        slice
          .map(
            (b) =>
              `**@${b.user.username}**\n> **ID :** \`${b.user.id}\`\n> **Raison :** ${b.reason ?? "Aucune raison fournie"}`
          )
          .join("\n\n")
      ),
    ],
    BLURPLE
  );
  const row = actionRow(
    button(`${CMD}:page:${authorId}:${p - 1}`, "Précédent", ButtonStyle.Primary, "◀️", p === 0),
    button(`${CMD}:page:${authorId}:${p}`, `${p + 1}/${pages}`, ButtonStyle.Secondary, undefined, true),
    button(`${CMD}:page:${authorId}:${p + 1}`, "Suivant", ButtonStyle.Primary, "▶️", p === pages - 1)
  );
  return { components: [body, row], flags: FLAGS_V2 };
}

async function canView(guild: Guild, userId: string): Promise<boolean> {
  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.permissions.has(PermissionFlagsBits.BanMembers) ?? false;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  if (!hasPerm(interaction, PermissionFlagsBits.BanMembers)) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Bannir des membres**.");
    return;
  }
  const payload = await renderPage(guild, interaction.user.id, 0);
  if (!payload) {
    await interaction.reply({
      components: [msgPanel("ℹ️ Aucun utilisateur n'est banni du serveur.", BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  await interaction.reply(payload);
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "page") return;
  const authorId = parts[2];
  const page = Number(parts[3]);
  if (!authorId || !Number.isFinite(page)) return;
  if (!(await checkAuthor(interaction, authorId))) return;
  if (!(await canView(guild, interaction.user.id))) {
    await replyErr(interaction, "❌ Vous avez besoin de la permission **Bannir des membres**.");
    return;
  }
  const payload = await renderPage(guild, authorId, page);
  if (!payload) {
    await replyErr(interaction, "❌ Impossible de récupérer la liste des bannis.");
    return;
  }
  await interaction.update(payload);
}
