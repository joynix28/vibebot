import { AuditLogEvent, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, GuildAuditLogsEntry } from "discord.js";
import { FLAGS_V2, panel, sepBlock, textBlock } from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("Afficher l'historique des sanctions d'un membre (audit log récent).")
  .addUserOption((o) => o.setName("utilisateur").setDescription("Membre à inspecter (défaut : vous)."));

function actionLabel(entry: GuildAuditLogsEntry): string {
  const changes = entry.changes;
  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return "🔨 Bannissement";
    case AuditLogEvent.MemberBanRemove:
      return "🔓 Débannissement";
    case AuditLogEvent.MemberKick:
      return "👢 Expulsion";
    case AuditLogEvent.MemberUpdate: {
      const keys = changes.map((c) => c.key);
      if (keys.includes("communication_disabled_until")) return "🔇 Exclusion temporaire (mute)";
      if (keys.includes("nick")) return "✏️ Pseudo modifié";
      return "✏️ Membre modifié";
    }
    case AuditLogEvent.MemberRoleUpdate:
      return "🎭 Rôles modifiés";
    default:
      return "📌 Action";
  }
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `<t:${s}:R>`;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  const user = interaction.options.getUser("utilisateur") ?? interaction.user;
  const viewingOther = user.id !== interaction.user.id;
  if (viewingOther) {
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await replyErr(interaction, "❌ Vous avez besoin de la permission **Exclure des membres** pour voir l'historique d'un autre membre.");
      return;
    }
  }

  let logs;
  try {
    logs = await guild.fetchAuditLogs({ limit: 50 });
  } catch {
    await replyErr(interaction, "❌ Impossible de lire l'audit log (permission **Voir les logs du serveur** requise pour le bot).");
    return;
  }

  const entries = [...logs.entries.values()]
    .filter((e) => {
      const t = e.target as unknown;
      return t !== null && typeof t === "object" && "id" in t && (t as { id: string }).id === user.id;
    })
    .slice(0, 15);

  const header = `# 📜 Historique de ${user}\nCréation du compte : <t:${Math.floor(user.createdTimestamp / 1000)}> (<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`;
  if (!entries.length) {
    await interaction.reply({
      components: [
        panel(
          [textBlock(header), sepBlock(), textBlock("ℹ️ Aucune sanction récente trouvée dans l'audit log.")],
          BLURPLE
        ),
      ],
      flags: FLAGS_V2,
    });
    return;
  }

  const lines = entries.map((e) => {
    const executor = e.executor ? `${e.executor} \`@${e.executor.username}\`` : "*système*";
    const reason = e.reason ? ` — *${e.reason.slice(0, 120)}*` : "";
    return `> ${ts(e.createdTimestamp)} — **${actionLabel(e)}** par ${executor}${reason}`;
  });

  const body = `# 📜 Historique de ${user}\n${lines.join("\n")}`.slice(0, 3900);
  await interaction.reply({
    components: [
      panel(
        [textBlock(body), sepBlock(), textBlock("*Basé sur les 50 dernières entrées de l'audit log.*")],
        BLURPLE
      ),
    ],
    flags: FLAGS_V2,
  });
}
