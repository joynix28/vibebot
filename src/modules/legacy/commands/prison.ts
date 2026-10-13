import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  GuildMember,
  Client,
  TextBasedChannel,
  Role,
  User,
  ContainerBuilder,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
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
  .setDescription("Envoie un membre en prison (rôles retirés et sauvegardés).");

const MENU_ID = "prison:menu";
const MODAL_METTRE = "prison:modal:mettre";
const MODAL_LIBERER = "prison:modal:liberer";
const MODAL_CONFIG = "prison:modal:config";

/** setTimeout ne supporte pas plus de ~24,8 jours. */
const MAX_TIMEOUT_MS = 2_147_483_647;
const jailTimers = new Map<string, NodeJS.Timeout>();

function modOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  const member = interaction.member as GuildMember | null;
  return !!member?.permissions.has(PermissionFlagsBits.ModerateMembers);
}

function adminOnly(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
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

/** Hub : menu d'actions (réponse éphémère). */
function hubComponents(): [ContainerBuilder, ActionRowBuilder<StringSelectMenuBuilder>] {
  const head = panel(
    [
      textBlock("## 🔒 Prison"),
      textBlock("Emprisonne un membre (rôles retirés et sauvegardés). Choisis une action dans le menu ci-dessous."),
    ],
    GOLD
  );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(MENU_ID)
      .setPlaceholder("Choisis une action…")
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Emprisonner un membre")
          .setValue("mettre")
          .setEmoji("🔒")
          .setDescription("Retire ses rôles et lui assigne le rôle prison."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Libérer un membre")
          .setValue("liberer")
          .setEmoji("🔓")
          .setDescription("Restaure ses rôles sauvegardés."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Liste des prisonniers")
          .setValue("liste")
          .setEmoji("📃")
          .setDescription("Affiche les membres en prison."),
        new StringSelectMenuOptionBuilder()
          .setLabel("Configurer la prison")
          .setValue("config")
          .setEmoji("⚙️")
          .setDescription("Définit le rôle prison et le salon d'annonce.")
      )
  );
  return [head, row];
}

function mettreModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_METTRE).setTitle("Emprisonner un membre");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Membre")
      .setUserSelectMenuComponent(
        new UserSelectMenuBuilder().setCustomId("membre").setPlaceholder("Choisir le membre…")
      ),
    new LabelBuilder()
      .setLabel("Durée")
      .setDescription("Vide = permanent. Exemples : 30m, 2h, 1j.")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("duree")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(10)
          .setPlaceholder("30m, 2h, 1j…")
      ),
    new LabelBuilder()
      .setLabel("Raison")
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId("raison")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(300)
          .setPlaceholder("Raison de l'emprisonnement…")
      )
  );
  return modal;
}

function libererModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_LIBERER).setTitle("Libérer un membre");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Membre")
      .setUserSelectMenuComponent(
        new UserSelectMenuBuilder().setCustomId("membre").setPlaceholder("Choisir le membre…")
      )
  );
  return modal;
}

function configModal(): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(MODAL_CONFIG).setTitle("Configurer la prison");
  modal.addComponents(
    new LabelBuilder()
      .setLabel("Rôle prison")
      .setRoleSelectMenuComponent(
        new RoleSelectMenuBuilder().setCustomId("role").setPlaceholder("Choisir le rôle prison…")
      ),
    new LabelBuilder()
      .setLabel("Salon d'annonce")
      .setDescription("Optionnel : les mises en prison y sont annoncées.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder()
          .setCustomId("salon")
          .setChannelTypes(ChannelType.GuildText)
          .setPlaceholder("Salon d'annonce…")
      )
  );
  return modal;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const [head, row] = hubComponents();
  await interaction.reply({ components: [head, row], flags: FLAGS_V2_EPHEMERAL });
}

/** Logique de l'ancienne sous-commande "liste". */
async function runListe(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.update({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!modOnly(interaction)) {
    await interaction.update({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const rows = listJailed(guild.id);
  if (rows.length === 0) {
    await interaction.update({ components: [okPanel("🔓 La prison est vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = rows.map((r) => {
    const rest = r.ends_at ? ` — reste ${formatRemaining(r.ends_at - Date.now())}` : " — ⏳ permanent";
    return `🔒 <@${r.user_id}>${rest}\n> *${r.reason ?? "Aucune raison"}* (par <@${r.jailed_by}>)`;
  });
  await interaction.update({
    components: [panel([textBlock("## 🔒 Prison"), sepBlock(false), textBlock(lines.join("\n\n"))], GOLD)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Logique de l'ancienne sous-commande "liberer". */
async function runLiberer(interaction: ModalSubmitInteraction, user: User): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!modOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const ok = await releaseJailed(interaction.client, guild.id, user.id);
  await interaction.reply({
    components: [ok ? okPanel(`🔓 <@${user.id}> a été libéré, ses rôles ont été restaurés.`) : errPanel("Ce membre n'est pas en prison.")],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Logique de l'ancienne sous-commande "config". */
async function runConfig(interaction: ModalSubmitInteraction, roleId: string, salonId: string | null): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!adminOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé aux administrateurs (Gérer le serveur).")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  setJailConfig(guild.id, roleId, salonId);
  await interaction.reply({
    components: [okPanel(`🔒 Rôle prison : <@&${roleId}>${salonId ? `\n📢 Annonces : <#${salonId}>` : ""}`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

/** Logique de l'ancienne sous-commande "mettre". */
async function runMettre(
  interaction: ModalSubmitInteraction,
  user: User,
  rawDur: string | null,
  reason: string | null
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!modOnly(interaction)) {
    await interaction.reply({ components: [errPanel("Réservé à la modération.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const cfg = getJailConfig(guild.id);
  if (!cfg) {
    await interaction.reply({ components: [errPanel("Configure d'abord la prison via le menu « Configurer la prison ».")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
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
    await interaction.reply({ components: [errPanel("Le rôle prison configuré n'existe plus. Reconfigure via le menu.")], flags: FLAGS_V2_EPHEMERAL });
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
  if (rawDur) {
    const parsed = parseDuration(rawDur);
    if (!parsed) {
      await interaction.reply({ components: [errPanel("Durée invalide. Exemples : `30m`, `2h`, `1j`.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    endsAt = Date.now() + parsed.ms;
    durationLabel = parsed.label;
  }

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

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.customId !== MENU_ID) return;
  if (!interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];
  if (action === "liste") {
    await runListe(interaction);
    return;
  }
  if (action === "mettre") {
    await interaction.showModal(mettreModal());
    return;
  }
  if (action === "liberer") {
    await interaction.showModal(libererModal());
    return;
  }
  if (action === "config") {
    await interaction.showModal(configModal());
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  if (interaction.customId === MODAL_METTRE) {
    const users = interaction.fields.getSelectedUsers("membre", true);
    const user = users.first();
    if (!user) {
      await interaction.reply({ components: [errPanel("Sélectionne un membre.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const rawDur = interaction.fields.getTextInputValue("duree").trim() || null;
    const reason = interaction.fields.getTextInputValue("raison").trim() || null;
    await runMettre(interaction, user, rawDur, reason);
    return;
  }

  if (interaction.customId === MODAL_LIBERER) {
    const users = interaction.fields.getSelectedUsers("membre", true);
    const user = users.first();
    if (!user) {
      await interaction.reply({ components: [errPanel("Sélectionne un membre.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await runLiberer(interaction, user);
    return;
  }

  if (interaction.customId === MODAL_CONFIG) {
    const roles = interaction.fields.getSelectedRoles("role", true);
    const roleId = roles.firstKey();
    if (!roleId) {
      await interaction.reply({ components: [errPanel("Sélectionne un rôle.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const chans = interaction.fields.getSelectedChannels("salon");
    const salonId = chans?.firstKey() ?? null;
    await runConfig(interaction, roleId, salonId);
    return;
  }
}
