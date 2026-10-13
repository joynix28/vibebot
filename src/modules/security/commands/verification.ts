import {
  ActionRowBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { panel, textBlock, mediaBlock, button, actionRow, msgPanel, FLAGS_V2, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, saveGuild } from "../func/db.ts";
import type { Guild as GuildCfg } from "../func/db.ts";
import { genCode, renderCaptcha } from "../func/captcha.ts";

export const data = new SlashCommandBuilder()
  .setName("verification")
  .setDescription("Configurer la vérification des nouveaux membres (captcha).");

const CMD = "verification";
const BLUE = 0x297fb9;

const HUB_OPTIONS = [
  { label: "Activer", value: "enable", emoji: "🟢", description: "Activer la vérification" },
  { label: "Désactiver", value: "disable", emoji: "🔴", description: "Désactiver la vérification" },
  { label: "Rôle non vérifié", value: "setup_role", emoji: "🎭", description: "Créer ou choisir le rôle" },
  { label: "Salon de vérification", value: "setup_channel", emoji: "📝", description: "Créer ou choisir le salon" },
  { label: "Réinitialiser", value: "reset", emoji: "🧹", description: "Supprimer salon et rôle" },
  { label: "Vérifier un membre", value: "verify", emoji: "✅", description: "Vérifier manuellement" },
  { label: "MAJ permissions", value: "update_role", emoji: "🔄", description: "Mettre à jour les permissions" },
  { label: "Type de vérification", value: "type", emoji: "⚙️", description: "Captcha ou un seul clic" },
  { label: "Couleur du captcha", value: "captcha:color", emoji: "🎨", description: "Couleur du captcha" },
  { label: "Longueur du code", value: "captcha:length", emoji: "🔢", description: "Longueur du code (4-8)" },
  { label: "Lignes du captcha", value: "captcha:lines", emoji: "〰️", description: "Lignes parasites (0-3)" },
  { label: "Sensible à la casse", value: "captcha:sensitive", emoji: "🔠", description: "Casse du code" },
  { label: "Chiffres", value: "captcha:numbers", emoji: "#️⃣", description: "Chiffres dans le code" },
  { label: "Expiration", value: "captcha:timeout", emoji: "⏱️", description: "Durée de validité du captcha" },
];

function menuRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:menu`)
    .setPlaceholder("Choisis une action…")
    .addOptions(
      HUB_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDescription(o.description)
          .setEmoji(o.emoji)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function hubPayload(guild: Guild) {
  const cfg = ensureGuild(guild.id);
  const body = panel(
    [
      textBlock(
        `# ✅ Vérification\nVérification des nouveaux membres sur **${guild.name}** — ${cfg.verify_enabled ? "🟢 activée" : "🔴 désactivée"}.`
      ),
    ],
    BLUE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

/** Extrait un ID depuis une mention ou un ID brut. */
function parseId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? null;
}

function singleInputModal(action: string, title: string, fieldId: string, label: string, placeholder: string, required = true, def?: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:${action}`).setTitle(title);
  const input = new TextInputBuilder()
    .setCustomId(fieldId)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(60)
    .setPlaceholder(placeholder);
  if (def) input.setValue(def);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

// ---------------------------------------------------------------------------
// Logique métier (extraite des anciennes sous-commandes)
// ---------------------------------------------------------------------------

function doEnable(cfg: GuildCfg): string {
  cfg.verify_enabled = 1;
  saveGuild(cfg);
  return "🟢 La vérification a été **activée**.";
}

function doDisable(cfg: GuildCfg): string {
  cfg.verify_enabled = 0;
  saveGuild(cfg);
  return "🔴 La vérification a été **désactivée**.";
}

async function applyRolePermissions(guild: Guild, roleId: string, verifyChannelId: string | null): Promise<{ success: number; failures: number }> {
  let success = 0;
  let failures = 0;
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isTextBased() || ch.isThread() || ch.id === verifyChannelId) continue;
    if (!("permissionOverwrites" in ch)) continue;
    try {
      await (ch as any).permissionOverwrites.create(roleId, { SendMessages: false });
      success++;
    } catch {
      failures++;
    }
  }
  return { success, failures };
}

async function doSetupRole(guild: Guild, cfg: GuildCfg, roleInput?: string): Promise<string> {
  const logs: string[] = [];
  let role: any = null;
  if (roleInput) {
    const id = parseId(roleInput);
    role = id ? guild.roles.cache.get(id) ?? (await guild.roles.fetch(id).catch(() => null)) : null;
    if (!role) return "🔴 Rôle introuvable : mentionne le rôle ou colle son ID.";
    logs.push("Le rôle non vérifié a été défini.");
  } else {
    role = cfg.verify_role ? guild.roles.cache.get(cfg.verify_role) : undefined;
    if (!role) {
      role = await guild.roles.create({ name: "Non vérifié", permissions: [], reason: "Sécurité - vérification" });
      logs.push("Le rôle non vérifié a été créé.");
    } else {
      logs.push("Le rôle non vérifié existe déjà.");
    }
  }
  if (!role) return "🔴 Impossible de résoudre un rôle.";
  cfg.verify_role = role.id;
  saveGuild(cfg);
  logs.push("Configuration des permissions des salons...");
  const { success, failures } = await applyRolePermissions(guild, role.id, cfg.verify_channel);
  logs.push(`Réussites : ${success}`, `Échecs : ${failures}`, "Terminé.");
  return (
    `Le rôle non vérifié est configuré. Pense à le placer au-dessus de tes **rôles publics**.\n\n**Journal :**\n${logs.join("\n")}`
  );
}

async function doSetupChannel(guild: Guild, cfg: GuildCfg, channelInput?: string): Promise<string> {
  const overwrites = [
    { id: guild.id, type: 0 as const, allow: 0n, deny: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages },
  ];
  if (cfg.verify_role) {
    overwrites.push({
      id: cfg.verify_role,
      type: 0 as const,
      allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory,
      deny: PermissionFlagsBits.SendMessages,
    });
  }
  let ch: any = null;
  if (channelInput) {
    const id = parseId(channelInput);
    ch = id ? guild.channels.cache.get(id) ?? null : null;
    if (!ch || !ch.isTextBased()) return "🔴 Salon introuvable : mentionne un salon textuel ou colle son ID.";
    for (const ov of overwrites) {
      try {
        await ch.permissionOverwrites.create(ov.id, {
          ViewChannel: (ov.allow & PermissionFlagsBits.ViewChannel) ? true : null,
          SendMessages: false,
          ReadMessageHistory: (ov.allow & PermissionFlagsBits.ReadMessageHistory) ? true : null,
        });
      } catch {}
    }
  } else {
    ch = await guild.channels.create({
      name: "verification",
      type: ChannelType.GuildText,
      permissionOverwrites: overwrites,
      reason: "Sécurité - vérification",
    });
  }
  cfg.verify_channel = ch.id;
  saveGuild(cfg);

  const msg = panel(
    [textBlock("Ce serveur te demande de te vérifier pour accéder aux autres salons : complète le captcha en cliquant sur le bouton ci-dessous.")],
    BLUE
  );
  await ch
    .send({ components: [msg, actionRow(button("verification_verifyBtn", "Vérifier", ButtonStyle.Primary))], flags: FLAGS_V2 })
    .catch(() => {});
  return "Le salon de vérification a été configuré avec succès.";
}

async function doReset(guild: Guild, cfg: GuildCfg): Promise<string> {
  const logs: string[] = [];
  if (cfg.verify_channel) {
    const ch = guild.channels.cache.get(cfg.verify_channel);
    if (ch) {
      await ch.delete("Sécurité - réinitialisation de la vérification").catch(() => logs.push("Échec de suppression du salon."));
      logs.push("Salon de vérification supprimé.");
    }
    cfg.verify_channel = null;
  }
  if (cfg.verify_role) {
    const role = guild.roles.cache.get(cfg.verify_role);
    if (role) {
      await role.delete("Sécurité - réinitialisation de la vérification").catch(() => logs.push("Échec de suppression du rôle."));
      logs.push("Rôle non vérifié supprimé.");
    }
    cfg.verify_role = null;
  }
  cfg.verify_enabled = 0;
  saveGuild(cfg);
  logs.push("Vérification désactivée.");
  return `🧹 Vérification réinitialisée.\n${logs.join("\n")}`;
}

async function doVerify(guild: Guild, cfg: GuildCfg, userId: string): Promise<string> {
  const member: GuildMember | null = await guild.members.fetch(userId).catch(() => null);
  if (!member) return "🔴 Membre introuvable sur ce serveur.";
  if (cfg.verify_role && member.roles.cache.has(cfg.verify_role)) {
    await member.roles.remove(cfg.verify_role, "Vérification manuelle").catch(() => {});
  }
  return `✅ ${member.user} a été vérifié manuellement.`;
}

async function doUpdateRole(guild: Guild, cfg: GuildCfg): Promise<string> {
  if (!cfg.verify_role) return "🔴 Aucun rôle non vérifié configuré.";
  const { success, failures } = await applyRolePermissions(guild, cfg.verify_role, cfg.verify_channel);
  return `🔄 Permissions mises à jour.\nRéussites : ${success}\nÉchecs : ${failures}`;
}

function doType(cfg: GuildCfg, t: number): string | null {
  if (t !== 1 && t !== 2) return null;
  cfg.verify_type = t === 2 ? "BUTTON" : "CAPTCHA";
  saveGuild(cfg);
  return `Le type de vérification est maintenant **${t === 2 ? "Vérification en un clic" : "Code captcha"}**.`;
}

// ---------------------------------------------------------------------------
// Commande hub
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("Cette commande ne peut être utilisée que sur un serveur.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  // --- Hub (menu) : avant le flow captcha ---
  if (interaction.customId === `${CMD}:menu` && interaction.isStringSelectMenu()) {
    const cfg = ensureGuild(guild.id);
    const choice = interaction.values[0] ?? "";

    const direct: Record<string, () => Promise<string> | string> = {
      enable: () => doEnable(cfg),
      disable: () => doDisable(cfg),
      reset: () => doReset(guild, cfg),
      update_role: () => doUpdateRole(guild, cfg),
    };
    if (choice in direct) {
      const msg = await direct[choice]!();
      await interaction.update({ components: [panel([textBlock(msg)], BLUE), menuRow()], flags: FLAGS_V2 });
      return;
    }
    const modals: Record<string, ModalBuilder> = {
      setup_role: singleInputModal("setup_role", "Rôle non vérifié", "role", "Rôle (vide = créer)", "@NonVérifié ou ID (vide pour créer)", false),
      setup_channel: singleInputModal("setup_channel", "Salon de vérification", "channel", "Salon (vide = créer)", "#verification ou ID (vide pour créer)", false),
      verify: singleInputModal("verify", "Vérifier un membre", "user", "Membre (mention ou ID)", "@membre ou 123456789"),
      type: singleInputModal("type", "Type de vérification", "type", "Type (1 ou 2)", "1 = Captcha, 2 = Un clic"),
      "captcha:color": singleInputModal("captcha:color", "Couleur du captcha", "color", "Couleur hexadécimale", "#ffffff"),
      "captcha:length": singleInputModal("captcha:length", "Longueur du code", "length", "Longueur (4 à 8)", "6"),
      "captcha:lines": singleInputModal("captcha:lines", "Lignes du captcha", "lines", "Lignes (0 à 3)", "2"),
      "captcha:sensitive": singleInputModal("captcha:sensitive", "Sensible à la casse", "sensitive", "Sensible (oui / non)", "non"),
      "captcha:numbers": singleInputModal("captcha:numbers", "Chiffres", "numbers", "Chiffres (oui / non)", "non"),
      "captcha:timeout": singleInputModal("captcha:timeout", "Expiration", "timeout", "Durée (30, 60, 120, 300)", "120"),
    };
    const modal = modals[choice];
    if (modal) {
      await interaction.showModal(modal);
      return;
    }
    return;
  }

  // --- Flow captcha existant ---
  if (interaction.customId === "verification_verifyBtn") {
    const cfg = ensureGuild(guild.id);
    if (!cfg.verify_enabled) {
      await interaction.reply({ content: "La vérification est désactivée.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (cfg.verify_type === "BUTTON") {
      const mgr = (interaction.member as any)?.roles;
      if (cfg.verify_role && mgr?.remove) await mgr.remove(cfg.verify_role).catch(() => {});
      await interaction.reply({ content: "🟢 Tu as été vérifié avec succès.", flags: MessageFlags.Ephemeral });
      return;
    }
    const code = genCode(cfg.captcha_length || 6);
    const img = await renderCaptcha(code);

    pending.set(interaction.user.id, {
      code,
      expires: Date.now() + (cfg.captcha_timeout || 120) * 1000,
      entered: "",
      buttons: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });

    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    await interaction.editReply({ files: [{ attachment: img, name: "captcha.png" }] });
    const m = await interaction.fetchReply();
    const p = pending.get(interaction.user.id)!;
    p.img = m.attachments.first()?.url;
    await interaction.editReply({ components: buildEntry(p), flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const p = pending.get(interaction.user.id);
  if (!p || Date.now() > p.expires) {
    // Ignore les interactions du hub déjà traitées plus haut
    if (interaction.customId.startsWith(`${CMD}:`)) return;
    pending.delete(interaction.user.id);
    const expired = msgPanel(
      "🔴 Ton captcha a expiré.\n\nPour en obtenir un nouveau, clique sur le bouton **Vérifier** ci-dessous.",
      BLUE
    );
    await interaction
      .update({ components: [expired], flags: FLAGS_V2 })
      .catch(async () => {
        await interaction.reply({ content: "🔴 Ton captcha a expiré, clique à nouveau sur Vérifier.", flags: MessageFlags.Ephemeral }).catch(() => {});
      });
    return;
  }
  const codeLen = p.code.length;

  if (interaction.customId.startsWith("verification_digit_")) {
    const d = interaction.customId.slice("verification_digit_".length);
    if (p.entered.length < codeLen && /^\d$/.test(d)) {
      p.entered += d;
    }
    await interaction.update({ components: buildEntry(p), flags: FLAGS_V2 });
    return;
  }

  if (interaction.customId === "verification_back") {
    p.entered = p.entered.slice(0, -1);
    await interaction.update({ components: buildEntry(p), flags: FLAGS_V2 });
    return;
  }

  if (interaction.customId === "verification_submit") {
    const cfg = ensureGuild(guild.id);
    if (p.entered === p.code) {
      pending.delete(interaction.user.id);
      const mgr = (interaction.member as any)?.roles;
      if (cfg.verify_role && mgr?.remove) await mgr.remove(cfg.verify_role).catch(() => {});
      await interaction.update({
        components: [panel([textBlock("🟢 Tu as été vérifié avec succès.")], BLUE)],
        flags: FLAGS_V2,
      });
    } else {
      p.entered = "";
      await interaction.update({ components: buildEntry(p, "🔴 Mauvais code, réessaie."), flags: FLAGS_V2 });
    }
    return;
  }

  await interaction.reply({ content: "Action inconnue.", flags: MessageFlags.Ephemeral });
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal") return;
  const cfg = ensureGuild(guild.id);
  const action = parts.slice(2).join(":");
  let msg: string | null = null;

  const val = (id: string) => interaction.fields.getTextInputValue(id).trim();

  if (action === "setup_role") {
    msg = await doSetupRole(guild, cfg, val("role") || undefined);
  } else if (action === "setup_channel") {
    msg = await doSetupChannel(guild, cfg, val("channel") || undefined);
  } else if (action === "verify") {
    const id = parseId(val("user"));
    msg = id ? await doVerify(guild, cfg, id) : "🔴 Membre invalide : mentionne-le ou colle son ID.";
  } else if (action === "type") {
    const t = parseInt(val("type"), 10);
    msg = doType(cfg, t) ?? "🔴 Type invalide : 1 (Captcha) ou 2 (Un clic).";
  } else if (action === "captcha:color") {
    const c = val("color");
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) {
      msg = "🔴 Couleur hexadécimale invalide, ex : `#ffffff`.";
    } else {
      cfg.captcha_color = c;
      saveGuild(cfg);
      msg = `La couleur du captcha est maintenant \`${c}\`.`;
    }
  } else if (action === "captcha:length") {
    const n = parseInt(val("length"), 10);
    if (![4, 5, 6, 7, 8].includes(n)) {
      msg = "🔴 La longueur doit être entre 4 et 8.";
    } else {
      cfg.captcha_length = n;
      saveGuild(cfg);
      msg = `La longueur du captcha est maintenant de **${n}**.`;
    }
  } else if (action === "captcha:lines") {
    const n = parseInt(val("lines"), 10);
    if (![0, 1, 2, 3].includes(n)) {
      msg = "🔴 Le nombre de lignes doit être entre 0 et 3.";
    } else {
      cfg.captcha_lines = n;
      saveGuild(cfg);
      msg = `Le nombre de lignes du captcha est maintenant de **${n}**.`;
    }
  } else if (action === "captcha:sensitive") {
    const t = val("sensitive").toLowerCase();
    const v = ["oui", "yes", "true", "1"].includes(t) ? 1 : ["non", "no", "false", "0"].includes(t) ? 0 : null;
    if (v === null) {
      msg = '🔴 Réponds par "oui" ou "non".';
    } else {
      cfg.captcha_sensitive = v;
      saveGuild(cfg);
      msg = `Le captcha est maintenant ${v ? "**sensible**" : "**insensible**"} à la casse.`;
    }
  } else if (action === "captcha:numbers") {
    const t = val("numbers").toLowerCase();
    const v = ["oui", "yes", "true", "1"].includes(t) ? 1 : ["non", "no", "false", "0"].includes(t) ? 0 : null;
    if (v === null) {
      msg = '🔴 Réponds par "oui" ou "non".';
    } else {
      cfg.captcha_numbers = v;
      saveGuild(cfg);
      msg = `Le captcha ${v ? "**contiendra**" : "ne contiendra **pas**"} de chiffres.`;
    }
  } else if (action === "captcha:timeout") {
    const n = parseInt(val("timeout"), 10);
    if (![30, 60, 120, 300].includes(n)) {
      msg = "🔴 La durée doit être 30, 60, 120 ou 300 secondes.";
    } else {
      cfg.captcha_timeout = n;
      saveGuild(cfg);
      msg = `Le captcha expirera après **${n} secondes**.`;
    }
  } else {
    return;
  }

  await interaction.reply({ components: [panel([textBlock(msg)], BLUE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
}

const pending = new Map<string, { code: string; expires: number; entered: string; img?: string; buttons: number[] }>();

function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function buildEntry(p: { entered: string; code: string; img?: string; buttons: number[] }, err?: string): any[] {
  const len = p.code.length;
  const slots: string[] = [];
  for (let i = 0; i < len; i++) slots.push(p.entered[i] ?? "_");
  const display = slots.map((s) => `\`${s}\``).join(" ");

  const blocks: any[] = [
    textBlock("Entre le code affiché sur l'image pour te vérifier :"),
    textBlock(`> Code : ${display}`),
  ];
  if (err) blocks.unshift(textBlock(err));
  if (p.img) blocks.push(mediaBlock([{ url: p.img }]));

  const digits = p.buttons.map((d) => button(`verification_digit_${d}`, String(d), ButtonStyle.Secondary));
  const row1 = actionRow(...digits.slice(0, 5));
  const row2 = actionRow(...digits.slice(5, 10));
  const row3 = actionRow(button("verification_back", "Supprimer", ButtonStyle.Danger), button("verification_submit", "Valider", ButtonStyle.Success));

  return [panel(blocks, BLUE), row1, row2, row3];
}
