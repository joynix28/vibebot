import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type {
  ChatInputCommandInteraction,
  GuildMember,
  Client,
  TextBasedChannel,
  Role,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  GREEN,
  RED,
  GOLD,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
} from "../../../core/ui.ts";
import { db } from "../../../core/db.ts";
import {
  getJailConfig,
  setJailConfig,
  jailUser,
  getJailed,
  listJailed,
  releaseUser,
  dueJails,
} from "../func/db-plus.ts";
import { parseDuration } from "../func/dur.ts";

export const data = new SlashCommandBuilder()
  .setName("prison")
  .setDescription("Envoie un membre en prison (rôles retirés et sauvegardés).")
  .addSubcommand((s) =>
    s
      .setName("mettre")
      .setDescription("Emprisonne un membre.")
      .addUserOption((o) => o.setName("membre").setDescription("Le membre à emprisonner.").setRequired(true))
      .addStringOption((o) =>
        o.setName("duree").setDescription("Durée : 30m, 2h, 1j… (vide = permanent).").setMaxLength(10)
      )
      .addStringOption((o) => o.setName("raison").setDescription("Raison de l'emprisonnement.").setMaxLength(300))
  )
  .addSubcommand((s) =>
    s
      .setName("liberer")
      .setDescription("Libère un membre (rôles restaurés).")
      .addUserOption((o) => o.setName("membre").setDescription("Le membre à libérer.").setRequired(true))
  )
  .addSubcommand((s) => s.setName("liste").setDescription("Liste les membres actuellement en prison."))
  .addSubcommand((s) =>
    s
      .setName("config")
      .setDescription("Configure le rôle prison et le salon d'annonce.")
      .addRoleOption((o) => o.setName("role").setDescription("Le rôle prison.").setRequired(true))
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon d'annonce (optionnel).").addChannelTypes(ChannelType.GuildText)
      )
  );

/** setTimeout ne supporte pas plus de ~24,8 jours. */
const MAX_TIMEOUT_MS = 2_147_483_647;
const jailTimers = new Map<string, NodeJS.Timeout>();

function modOnly(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ModerateMembers);
}

function adminOnly(interaction: ChatInputCommandInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ManageGuild);
}

function formatRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.floor(ms / 60000));
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

/** Libère un membre : retire le rôle prison, restaure les rôles sauvegardés. */
export async function releaseJailed(client: Client, guildId: string, userId: string): Promise<boolean> {
  const row = getJailed(guildId, userId);
  if (!row) return false;
  const timerKey = `${guildId}:${userId}`;
  const timer = jailTimers.get(timerKey);
  if (timer) {
    clearTimeout(timer);
    jailTimers.delete(timerKey);
  }
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const cfg = getJailConfig(guildId);
  if (guild) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      if (cfg?.role_id && member.roles.cache.has(cfg.role_id)) {
        await member.roles.remove(cfg.role_id, "Libération de prison").catch(() => {});
      }
      let saved: string[] = [];
      try {
        saved = JSON.parse(row.roles_json) as string[];
      } catch {
        saved = [];
      }
      const toRestore = saved
        .map((id) => guild.roles.cache.get(id))
        .filter((r): r is Role => !!r && !r.managed && r.id !== guild.id);
      if (toRestore.length > 0) {
        await member.roles.add(toRestore, "Restauration après prison").catch(() => {});
      }
    }
  }
  releaseUser(guildId, userId);
  return true;
}

/** Programme la libération automatique d'un membre. */
export function scheduleJailRelease(client: Client, guildId: string, userId: string, endsAt: number): void {
  const key = `${guildId}:${userId}`;
  const old = jailTimers.get(key);
  if (old) clearTimeout(old);
  const delay = endsAt - Date.now();
  if (delay <= 0) {
    void releaseJailed(client, guildId, userId);
    return;
  }
  jailTimers.set(
    key,
    setTimeout(() => {
      jailTimers.delete(key);
      void releaseJailed(client, guildId, userId).catch((err) =>
        console.error("[legacy] échec libération prison", err)
      );
    }, Math.min(delay, MAX_TIMEOUT_MS))
  );
}

/** Libère toutes les peines arrivées à échéance (sweep périodique / boot). */
export async function releaseDueJails(client: Client): Promise<number> {
  let n = 0;
  for (const row of dueJails(Date.now())) {
    const ok = await releaseJailed(client, row.guild_id, row.user_id).catch(() => false);
    if (ok) n++;
  }
  return n;
}

/** Restaure les timers de prison au démarrage du bot. */
export async function restoreJailTimers(client: Client): Promise<void> {
  const now = Date.now();
  let scheduled = 0;
  let released = 0;
  const all = db.query("SELECT * FROM legacy2_jail").all() as ReturnType<typeof listJailed>;
  for (const row of all) {
    if (row.ends_at && row.ends_at <= now) {
      if (await releaseJailed(client, row.guild_id, row.user_id).catch(() => false)) released++;
    } else if (row.ends_at) {
      scheduleJailRelease(client, row.guild_id, row.user_id, row.ends_at);
      scheduled++;
    }
  }
  console.log(`[legacy] prison : ${scheduled} timer(s) restauré(s), ${released} libération(s) immédiate(s)`);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "config") {
    if (!adminOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const role = interaction.options.getRole("role", true);
    const salon = interaction.options.getChannel("salon");
    setJailConfig(guild.id, role.id, salon?.id ?? null);
    await interaction.reply({
      components: [okPanel(`🔒 Rôle prison : <@&${role.id}>${salon ? `\n📢 Annonces : <#${salon.id}>` : ""}`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "liste") {
    if (!modOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const rows = listJailed(guild.id);
    if (rows.length === 0) {
      await interaction.reply({ components: [okPanel("🔓 La prison est vide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const lines = rows.map((r) => {
      const rest = r.ends_at ? ` — reste ${formatRemaining(r.ends_at - Date.now())}` : " — ⏳ permanent";
      return `🔒 <@${r.user_id}>${rest}\n> *${r.reason ?? "Aucune raison"}* (par <@${r.jailed_by}>)`;
    });
    await interaction.reply({
      components: [panel([textBlock("## 🔒 Prison"), sepBlock(false), textBlock(lines.join("\n\n"))], GOLD)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "liberer") {
    if (!modOnly(interaction)) {
      await interaction.reply({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const user = interaction.options.getUser("membre", true);
    const ok = await releaseJailed(interaction.client, guild.id, user.id);
    await interaction.reply({
      components: [ok ? okPanel(`🔓 <@${user.id}> a été libéré, ses rôles ont été restaurés.`) : errPanel("Ce membre n'est pas en prison.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  // mettre
  if (!modOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const cfg = getJailConfig(guild.id);
  if (!cfg) {
    await interaction.reply({ components: [errPanel("Configure d'abord la prison avec `/prison config`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const user = interaction.options.getUser("membre", true);
  if (user.bot) {
    await interaction.reply({ components: [errPanel("On n'emprisonne pas les bots.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (user.id === guild.ownerId) {
    await interaction.reply({ components: [errPanel("Impossible d'emprisonner le propriétaire du serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const target = await guild.members.fetch(user.id).catch(() => null);
  if (!target) {
    await interaction.reply({ components: [errPanel("Membre introuvable sur ce serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const executor = interaction.member as GuildMember;
  if (interaction.user.id !== guild.ownerId && target.roles.highest.position >= executor.roles.highest.position) {
    await interaction.reply({ components: [errPanel("Hiérarchie : tu ne peux pas emprisonner ce membre.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const me = await guild.members.fetchMe().catch(() => null);
  const jailRole = guild.roles.cache.get(cfg.role_id);
  if (!jailRole) {
    await interaction.reply({ components: [errPanel("Le rôle prison configuré n'existe plus. Reconfigure avec `/prison config`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!me || jailRole.position >= me.roles.highest.position) {
    await interaction.reply({ components: [errPanel("Je ne peux pas gérer ce rôle prison : place mon rôle au-dessus du rôle prison.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.roles.highest.position >= me.roles.highest.position) {
    await interaction.reply({ components: [errPanel("Je ne peux pas gérer ce membre (rôle trop élevé).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  let endsAt: number | null = null;
  let durationLabel = "⏳ permanent";
  const rawDur = interaction.options.getString("duree");
  if (rawDur) {
    const parsed = parseDuration(rawDur);
    if (!parsed) {
      await interaction.reply({ components: [errPanel("Durée invalide. Exemples : `30m`, `2h`, `1j`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    endsAt = Date.now() + parsed.ms;
    durationLabel = parsed.label;
  }
  const reason = interaction.options.getString("raison")?.trim() || null;

  // Sauvegarde les rôles (hors @everyone, hors rôles managés, hors rôle prison).
  const savedRoles = target.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed && r.id !== jailRole.id)
    .map((r) => r.id);
  try {
    if (savedRoles.length > 0) await target.roles.remove(savedRoles, "Mise en prison");
    await target.roles.add(jailRole, `Prison : ${reason ?? "aucune raison"}`);
  } catch {
    await interaction.reply({ components: [errPanel("Échec de la mise en prison (permissions insuffisantes).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  jailUser({ guildId: guild.id, userId: user.id, roles: savedRoles, reason, jailedBy: interaction.user.id, endsAt });
  if (endsAt) scheduleJailRelease(interaction.client, guild.id, user.id, endsAt);

  if (cfg.channel_id) {
    const announce = (await guild.channels.fetch(cfg.channel_id).catch(() => null)) as TextBasedChannel | null;
    if (announce?.isSendable()) {
      await announce
        .send({
          components: [
            panel(
              [textBlock(`## 🔒 Mise en prison\n<@${user.id}> a été emprisonné par <@${interaction.user.id}>.\n**Durée :** ${durationLabel}\n**Raison :** ${reason ?? "*Aucune*"}`)],
              RED
            ),
          ],
          flags: FLAGS_V2,
        })
        .catch(() => {});
    }
  }
  await interaction.reply({
    components: [okPanel(`🔒 <@${user.id}> est en prison (${durationLabel}).\n**Raison :** ${reason ?? "*Aucune*"}`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
