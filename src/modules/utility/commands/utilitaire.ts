import {
  SlashCommandBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  User,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  mediaBlock,
  okPanel,
  errPanel,
  actionRow,
  button,
  linkBtn,
} from "../../../core/ui.ts";
import { createRappel, countActiveRappels } from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("utilitaire")
  .setDescription("🛠️ Boîte à outils : infos, calculs, jeux, fun.");

type AnyIx = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

const CMD = "utilitaire";

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

const HUB_OPTIONS = [
  { label: "Avatar", value: "avatar", emoji: "🖼️", description: "Affiche l'avatar d'un membre en grand" },
  { label: "Infos serveur", value: "serveur", emoji: "🏰", description: "Informations détaillées du serveur" },
  { label: "Calculatrice", value: "calcul", emoji: "🧮", description: "Évalue une expression mathématique" },
  { label: "Mot de passe", value: "motdepasse", emoji: "🔑", description: "Génère un mot de passe sûr (privé)" },
  { label: "Couleur hex", value: "hex", emoji: "🎨", description: "Aperçu d'une couleur hexadécimale" },
  { label: "Timestamp", value: "timestamp", emoji: "⏱️", description: "Convertit date ↔ timestamp Unix" },
  { label: "Compte à rebours", value: "compte", emoji: "⏳", description: "Compte à rebours jusqu'à une date" },
  { label: "Rappel", value: "rappel", emoji: "⏰", description: "Programme un rappel (privé)" },
  { label: "Choisir", value: "choisir", emoji: "🎯", description: "Choisit une option au hasard" },
  { label: "Emojify", value: "emojify", emoji: "😀", description: "Transforme un texte en emojis" },
  { label: "Inverser", value: "inverser", emoji: "🔄", description: "Inverse l'ordre des caractères" },
  { label: "Art ASCII", value: "ascii", emoji: "🔠", description: "Convertit un texte en art ASCII" },
  { label: "Boule magique", value: "boule8", emoji: "🎱", description: "Pose une question à la boule magique" },
  { label: "Dés", value: "de", emoji: "🎲", description: "Lance un ou plusieurs dés" },
  { label: "Shifumi", value: "shifumi", emoji: "✊", description: "Pierre-feuille-ciseaux contre le bot" },
  { label: "Morpion", value: "morpion", emoji: "⭕", description: "Morpion contre un autre membre" },
  { label: "Puissance 4", value: "puissance4", emoji: "🟡", description: "Puissance 4 contre un autre membre" },
];

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:menu`)
    .setPlaceholder("Choisis un outil…")
    .addOptions(
      HUB_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDescription(o.description)
          .setEmoji(o.emoji)
      )
    );
  await interaction.reply({
    components: [
      panel([textBlock("# 🛠️ Boîte à outils\n> Choisis un outil ci-dessous.")], 0x5865f2),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txt(ix: ModalSubmitInteraction, id: string): string {
  return (ix.fields.getTextInputValue(id) ?? "").trim();
}

async function resolveUser(ix: AnyIx, raw: string): Promise<User | null> {
  const m = raw.match(/\d{17,20}/);
  if (!m) return null;
  return ix.client.users.fetch(m[0]).catch(() => null);
}

function parseOuiNon(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (/^(oui|o|yes|y|1|vrai|true)$/.test(s)) return true;
  if (/^(non|n|no|0|faux|false)$/.test(s)) return false;
  return null;
}

function field(
  id: string,
  label: string,
  opts: { required?: boolean; maxLength?: number; placeholder?: string; style?: TextInputStyle; description?: string; defaut?: string } = {}
): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(opts.style ?? TextInputStyle.Short)
    .setRequired(opts.required ?? false);
  if (opts.maxLength) input.setMaxLength(opts.maxLength);
  if (opts.placeholder) input.setPlaceholder(opts.placeholder);
  if (opts.defaut) input.setValue(opts.defaut);
  const lb = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (opts.description) lb.setDescription(opts.description);
  return lb;
}

function modalFor(action: string): ModalBuilder {
  switch (action) {
    case "avatar":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:avatar`)
        .setTitle("Avatar d'un membre")
        .addLabelComponents(
          field("membre", "Membre", { description: "Mention ou ID Discord. Vide = toi-même.", maxLength: 40, placeholder: "@pseudo ou 123…" })
        );
    case "calcul":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:calcul`)
        .setTitle("Calculatrice")
        .addLabelComponents(
          field("expression", "Expression", { required: true, maxLength: 100, placeholder: "(12 + 3) * 4 / 2", description: "+ - * / % ^ et parenthèses" })
        );
    case "motdepasse":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:motdepasse`)
        .setTitle("Générateur de mot de passe")
        .addLabelComponents(
          field("longueur", "Longueur (8 à 64)", { maxLength: 2, placeholder: "16", defaut: "16" }),
          field("majuscules", "Majuscules A-Z ? (oui/non)", { maxLength: 3, defaut: "oui" }),
          field("chiffres", "Chiffres 0-9 ? (oui/non)", { maxLength: 3, defaut: "oui" }),
          field("symboles", "Symboles ? (oui/non)", { maxLength: 3, defaut: "non" })
        );
    case "hex":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:hex`)
        .setTitle("Couleur hexadécimale")
        .addLabelComponents(
          field("couleur", "Code hex", { required: true, maxLength: 7, placeholder: "ff0000 ou #ff0000" })
        );
    case "timestamp":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:timestamp`)
        .setTitle("Convertir date / timestamp")
        .addLabelComponents(
          field("date", "Date (optionnel)", { maxLength: 50, placeholder: "25/12/2026 20:00 — vide = maintenant" }),
          field("unix", "Timestamp Unix (optionnel)", { maxLength: 12, placeholder: "1795636800" })
        );
    case "compte":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:compte`)
        .setTitle("Compte à rebours")
        .addLabelComponents(
          field("date", "Date cible", { required: true, maxLength: 50, placeholder: "25/12/2026 20:00" }),
          field("titre", "Titre (optionnel)", { maxLength: 80, placeholder: "Noël 🎄" })
        );
    case "rappel":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:rappel`)
        .setTitle("Programmer un rappel")
        .addLabelComponents(
          field("duree", "Dans combien de temps ?", { required: true, maxLength: 12, placeholder: "10m, 2h, 3d… (30 s à 30 jours)" }),
          field("message", "Message du rappel", { required: true, maxLength: 200, style: TextInputStyle.Paragraph, placeholder: "Appeler maman" })
        );
    case "choisir":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:choisir`)
        .setTitle("Choisir au hasard")
        .addLabelComponents(
          field("options", "Options séparées par des virgules", { required: true, maxLength: 500, style: TextInputStyle.Paragraph, placeholder: "pizza, sushi, tacos" })
        );
    case "emojify":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:emojify`)
        .setTitle("Texte → emojis")
        .addLabelComponents(
          field("texte", "Texte à convertir", { required: true, maxLength: 200, style: TextInputStyle.Paragraph })
        );
    case "inverser":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:inverser`)
        .setTitle("Inverser un texte")
        .addLabelComponents(
          field("texte", "Texte à inverser", { required: true, maxLength: 500, style: TextInputStyle.Paragraph })
        );
    case "ascii":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:ascii`)
        .setTitle("Art ASCII")
        .addLabelComponents(
          field("texte", "Texte (10 car. max, A-Z 0-9)", { required: true, maxLength: 10, placeholder: "SALUT" })
        );
    case "boule8":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:boule8`)
        .setTitle("Boule magique")
        .addLabelComponents(
          field("question", "Ta question (oui / non)", { required: true, maxLength: 200, placeholder: "Vais-je réussir ?" })
        );
    case "de":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:de`)
        .setTitle("Lancer des dés")
        .addLabelComponents(
          field("faces", "Faces par dé (2 à 100)", { maxLength: 3, placeholder: "6", defaut: "6" }),
          field("nombre", "Nombre de dés (1 à 20)", { maxLength: 2, placeholder: "1", defaut: "1" })
        );
    case "morpion":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:morpion`)
        .setTitle("Défier au morpion")
        .addLabelComponents(
          field("adversaire", "Adversaire", { required: true, maxLength: 40, placeholder: "@pseudo ou ID Discord" })
        );
    case "puissance4":
      return new ModalBuilder()
        .setCustomId(`${CMD}:modal:puissance4`)
        .setTitle("Défier au Puissance 4")
        .addLabelComponents(
          field("adversaire", "Adversaire", { required: true, maxLength: 40, placeholder: "@pseudo ou ID Discord" })
        );
    default:
      throw new Error(`Action inconnue : ${action}`);
  }
}

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------

async function runAvatar(ix: AnyIx, user: User): Promise<void> {
  const url = user.displayAvatarURL({ size: 1024, extension: "png" });
  const animated = user.avatar?.startsWith("a_") ?? false;
  await ix.reply({
    components: [
      panel(
        [
          textBlock(`🖼️ **Avatar de ${user}**${animated ? " *(animé : clique sur « Ouvrir en grand » pour le GIF)*" : ""}`),
          mediaBlock([{ url, description: `Avatar de ${user.tag}` }]),
        ],
        0x5865f2
      ),
      actionRow(linkBtn(user.displayAvatarURL({ size: 4096 }), "Ouvrir en grand", "🔗")),
    ],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Infos serveur
// ---------------------------------------------------------------------------

async function runServerinfo(ix: AnyIx): Promise<void> {
  const guild = ix.guild;
  if (!guild) {
    await ix.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const owner = await guild.fetchOwner().catch(() => null);
  const created = Math.floor(guild.createdTimestamp / 1000);
  const text = guild.channels.cache.filter((c) => c.isTextBased() && !c.isThread()).size;
  const voice = guild.channels.cache.filter((c) => c.isVoiceBased()).size;
  const emojis = guild.emojis.cache.size;
  const icon = guild.iconURL({ size: 512 });

  const blocks = [
    textBlock(
      `## 🏰 ${guild.name}\n` +
        `> **ID :** \`${guild.id}\`\n` +
        `> **Propriétaire :** ${owner ? `${owner} (\`${owner.id}\`)` : "*inconnu*"}\n` +
        `> **Créé le :** <t:${created}:F> (<t:${created}:R>)\n` +
        `> **Membres :** \`${guild.memberCount}\` | **Rôles :** \`${guild.roles.cache.size}\`\n` +
        `> **Salons :** \`${text}\` texte • \`${voice}\` vocaux\n` +
        `> **Emojis :** \`${emojis}\` | **Boosts :** \`${guild.premiumSubscriptionCount ?? 0}\` (niveau ${guild.premiumTier})\n` +
        `> **Vérification :** \`${guild.verificationLevel}\` | **Filtre explicite :** \`${guild.explicitContentFilter}\``
    ),
  ];
  if (icon) blocks.push(mediaBlock([{ url: icon, description: `Icône de ${guild.name}` }]));

  await ix.reply({ components: [panel(blocks, 0x5865f2)], flags: FLAGS_V2 });
}

// ---------------------------------------------------------------------------
// Calculatrice (mini-parser maison, sans eval)
// ---------------------------------------------------------------------------

const MAX_TOKENS = 200;
const MAX_RESULT = 1e15;

type Tok = number | "+" | "-" | "*" | "/" | "%" | "^" | "(" | ")";

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (j < src.length && ((src[j]! >= "0" && src[j]! <= "9") || src[j] === ".")) j++;
      const raw = src.slice(i, j);
      if (raw === "." || (raw.match(/\./g) ?? []).length > 1) throw new Error("Nombre invalide.");
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error("Nombre invalide.");
      toks.push(n);
      i = j;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/" || c === "%" || c === "^" || c === "(" || c === ")") {
      toks.push(c);
      i++;
      continue;
    }
    throw new Error(`Caractère interdit : \`${c}\`. Utilise uniquement chiffres, + - * / % ^ et parenthèses.`);
  }
  if (toks.length === 0) throw new Error("Expression vide.");
  if (toks.length > MAX_TOKENS) throw new Error("Expression trop longue.");
  return toks;
}

function evaluer(src: string): number {
  const toks = tokenize(src);
  let pos = 0;
  const peek = (): Tok | undefined => toks[pos];

  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      const t = peek();
      if (t !== "+" && t !== "-") return v;
      pos++;
      const r = parseTerm();
      v = t === "+" ? v + r : v - r;
    }
  }
  function parseTerm(): number {
    let v = parseFactor();
    for (;;) {
      const t = peek();
      if (t !== "*" && t !== "/" && t !== "%") return v;
      pos++;
      const r = parseFactor();
      if (t === "*") v *= r;
      else if (t === "/") {
        if (r === 0) throw new Error("Division par zéro impossible.");
        v /= r;
      } else {
        if (r === 0) throw new Error("Modulo par zéro impossible.");
        v %= r;
      }
    }
  }
  function parseFactor(): number {
    const v = parseUnary();
    if (peek() === "^") {
      pos++;
      return Math.pow(v, parseFactor());
    }
    return v;
  }
  function parseUnary(): number {
    const t = peek();
    if (t === "-") {
      pos++;
      return -parseUnary();
    }
    if (t === "+") {
      pos++;
      return parseUnary();
    }
    return parsePrimary();
  }
  function parsePrimary(): number {
    const t = toks[pos++];
    if (typeof t === "number") return t;
    if (t === "(") {
      const v = parseExpr();
      if (toks[pos++] !== ")") throw new Error("Parenthèse non fermée.");
      return v;
    }
    throw new Error("Expression invalide.");
  }

  const result = parseExpr();
  if (pos !== toks.length) throw new Error("Expression invalide.");
  if (!Number.isFinite(result)) throw new Error("Résultat non fini.");
  if (Math.abs(result) > MAX_RESULT) throw new Error("Résultat trop grand.");
  return result;
}

function fmtNum(n: number): string {
  return String(Math.round(n * 1e10) / 1e10);
}

async function runCalcul(ix: AnyIx, expr: string): Promise<void> {
  if (expr.length === 0 || expr.length > 100) {
    await ix.reply({ components: [errPanel("Expression invalide (1 à 100 caractères).")], flags: FLAGS_V2 });
    return;
  }
  try {
    const result = evaluer(expr);
    await ix.reply({
      components: [okPanel(`🧮 \`${expr}\`\n\n## = \`${fmtNum(result)}\``)],
      flags: FLAGS_V2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Expression invalide.";
    await ix.reply({ components: [errPanel(`❌ ${msg}`)], flags: FLAGS_V2 });
  }
}

// ---------------------------------------------------------------------------
// Mot de passe
// ---------------------------------------------------------------------------

const PWD_MIN = "abcdefghijklmnopqrstuvwxyz";
const PWD_MAJ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PWD_CHI = "0123456789";
const PWD_SYM = "!@#$%^&*()-_=+[]{};:,.<>?/";

async function runMotdepasse(ix: AnyIx, longueur: number, maj: boolean, chi: boolean, sym: boolean): Promise<void> {
  let pool = PWD_MIN;
  if (maj) pool += PWD_MAJ;
  if (chi) pool += PWD_CHI;
  if (sym) pool += PWD_SYM;
  if (pool.length === 0) {
    await ix.reply({ components: [errPanel("Choisis au moins un type de caractères.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const bytes = new Uint8Array(longueur);
  crypto.getRandomValues(bytes);
  let pwd = "";
  for (let i = 0; i < longueur; i++) pwd += pool[bytes[i]! % pool.length]!;

  await ix.reply({
    components: [okPanel(`🔑 **Mot de passe généré** (\`${longueur}\` caractères) :\n\`\`\`\n${pwd}\n\`\`\`\n*Visible uniquement par toi — ne le partage jamais.*`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Couleur hex
// ---------------------------------------------------------------------------

async function runHex(ix: AnyIx, raw: string): Promise<void> {
  const clean = raw.trim().replace(/^#/, "");
  const hex = /^[0-9a-fA-F]{3}$/.test(clean) ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    await ix.reply({ components: [errPanel("Code couleur invalide. Utilise 3 ou 6 caractères hexadécimaux, ex. : `ff0000`.")], flags: FLAGS_V2 });
    return;
  }
  const h = hex.toLowerCase();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);

  await ix.reply({
    components: [
      panel(
        [
          textBlock(`## 🎨 \`#${h}\`\n> **RGB :** \`${r}, ${g}, ${b}\`\n> **Discord :** \`0x${h}\``),
          mediaBlock([{ url: `https://dummyimage.com/200x200/${h}/${h}.png`, description: `Aperçu de la couleur #${h}` }]),
        ],
        parseInt(h, 16)
      ),
    ],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

/** Parse "JJ/MM/AAAA HH:MM" (heure optionnelle) ou laisse Date faire le reste. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (s.length > 50) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function runTimestamp(ix: AnyIx, dateStr: string | null, unix: number | null): Promise<void> {
  let ts: number;
  let source: string;
  if (dateStr) {
    const d = parseDate(dateStr);
    if (!d) {
      await ix.reply({ components: [errPanel("Date invalide. Essaie `25/12/2026 20:00` ou `2026-12-25T20:00`.")], flags: FLAGS_V2 });
      return;
    }
    ts = Math.floor(d.getTime() / 1000);
    source = `\`${dateStr}\``;
  } else if (unix !== null) {
    if (!Number.isSafeInteger(unix) || Math.abs(unix) > 4102444800) {
      await ix.reply({ components: [errPanel("Timestamp invalide.")], flags: FLAGS_V2 });
      return;
    }
    ts = unix;
    source = `\`${unix}\``;
  } else {
    ts = Math.floor(Date.now() / 1000);
    source = "maintenant";
  }

  await ix.reply({
    components: [
      panel([
        textBlock(
          `## ⏱️ Conversion (${source})\n` +
            `> **Unix :** \`${ts}\`\n` +
            `> **Date :** <t:${ts}:F>\n` +
            `> **Relatif :** <t:${ts}:R>\n\n` +
            `**Formats Discord à copier :**\n` +
            `\`<t:${ts}:t>\` → <t:${ts}:t> • \`<t:${ts}:D>\` → <t:${ts}:D> • \`<t:${ts}:R>\` → <t:${ts}:R>`
        ),
      ]),
    ],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Compte à rebours
// ---------------------------------------------------------------------------

function fmtCountdown(targetMs: number): string {
  const diff = targetMs - Date.now();
  if (diff <= 0) return "🎉 **C'est maintenant !**";
  const s = Math.floor(diff / 1000);
  const j = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (j > 0) parts.push(`\`${j}\` jour${j > 1 ? "s" : ""}`);
  if (h > 0) parts.push(`\`${h}\` h`);
  if (m > 0) parts.push(`\`${m}\` min`);
  parts.push(`\`${sec}\` s`);
  return parts.join(" ");
}

function renderCompte(targetMs: number, title: string) {
  const ts = Math.floor(targetMs / 1000);
  const cont = panel([textBlock(`## ⏳ ${title}\n\n${fmtCountdown(targetMs)}\n\n> **Échéance :** <t:${ts}:F> (<t:${ts}:R>)`)]);
  const row = actionRow(button(`${CMD}:compte:actu:${targetMs}`, "Actualiser", ButtonStyle.Primary, "🔄"));
  return { components: [cont, row], flags: FLAGS_V2 } as const;
}

async function runCompte(ix: AnyIx, dateStr: string, title: string): Promise<void> {
  const d = parseDate(dateStr);
  if (!d) {
    await ix.reply({ components: [errPanel("Date invalide. Essaie `25/12/2026 20:00` ou `2026-12-25T20:00`.")], flags: FLAGS_V2 });
    return;
  }
  if (d.getTime() > Date.now() + 10 * 365 * 24 * 3600 * 1000) {
    await ix.reply({ components: [errPanel("Date trop lointaine (max 10 ans).")], flags: FLAGS_V2 });
    return;
  }
  await ix.reply(renderCompte(d.getTime(), title || "Compte à rebours"));
}

// ---------------------------------------------------------------------------
// Rappel
// ---------------------------------------------------------------------------

const RAPPEL_MIN_MS = 30_000;
const RAPPEL_MAX_MS = 30 * 24 * 3600_000;
const RAPPEL_MAX_ACTIFS = 5;

/** Parse "10s", "5m", "2h", "3d" (et variantes françaises). */
function parseDuree(raw: string): number | null {
  const m = /^(\d+)\s*(s|sec|seconde?s?|m|min|minute?s?|h|heure?s?|d|jour?s?)$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase()[0];
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3600_000 : 86_400_000;
  const ms = n * mult;
  if (!Number.isSafeInteger(ms)) return null;
  return ms;
}

async function runRappel(ix: AnyIx, dureeStr: string, message: string): Promise<void> {
  const guild = ix.guild;
  const channel = ix.channel;
  if (!guild || !channel || channel.isDMBased()) {
    await ix.reply({ components: [errPanel("Cette commande doit être utilisée dans un salon d'un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (message.length === 0) {
    await ix.reply({ components: [errPanel("Le message du rappel ne peut pas être vide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const ms = parseDuree(dureeStr);
  if (ms === null) {
    await ix.reply({ components: [errPanel("Durée invalide. Exemples : `30s`, `10m`, `2h`, `3d`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (ms < RAPPEL_MIN_MS) {
    await ix.reply({ components: [errPanel("Durée minimale : 30 secondes.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (ms > RAPPEL_MAX_MS) {
    await ix.reply({ components: [errPanel("Durée maximale : 30 jours.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (countActiveRappels(ix.user.id) >= RAPPEL_MAX_ACTIFS) {
    await ix.reply({ components: [errPanel(`Tu as déjà ${RAPPEL_MAX_ACTIFS} rappels actifs. Attends qu'ils sonnent avant d'en créer d'autres.`)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const rappel = createRappel({
    guildId: guild.id,
    channelId: channel.id,
    userId: ix.user.id,
    message,
    remindAt: Date.now() + ms,
  });
  const ts = Math.floor(rappel.remind_at / 1000);
  await ix.reply({
    components: [okPanel(`⏰ **Rappel programmé !** Je te mentionnerai ici <t:${ts}:R> (<t:${ts}:F>).`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Choisir
// ---------------------------------------------------------------------------

async function runChoisir(ix: AnyIx, raw: string): Promise<void> {
  const choix = raw
    .split(/[,|\n]/)
    .map((s) => s.trim().slice(0, 100))
    .filter((s) => s.length > 0)
    .slice(0, 20);
  if (choix.length < 2) {
    await ix.reply({ components: [errPanel("Propose au moins 2 options séparées par des virgules.")], flags: FLAGS_V2 });
    return;
  }
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n = new DataView(bytes.buffer).getUint32(0) % choix.length;
  await ix.reply({
    components: [okPanel(`🎲 Parmi **${choix.length}** options, je choisis…\n\n## ${choix[n]}`)],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Emojify
// ---------------------------------------------------------------------------

const EMOJI_CHIFFRES: Record<string, string> = {
  "0": "0️⃣", "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣",
  "5": "5️⃣", "6": "6️⃣", "7": "7️⃣", "8": "8️⃣", "9": "9️⃣",
};

async function runEmojify(ix: AnyIx, texte: string): Promise<void> {
  let out = "";
  for (const ch of texte.toLowerCase()) {
    if (ch >= "a" && ch <= "z") out += `:regional_indicator_${ch}: `;
    else if (EMOJI_CHIFFRES[ch]) out += `${EMOJI_CHIFFRES[ch]} `;
    else if (ch === " ") out += "  ";
    else if (ch === "!") out += "❗ ";
    else if (ch === "?") out += "❓ ";
    else out += `${ch} `;
  }
  out = out.trim();
  if (out.length === 0 || out.length > 1900) {
    await ix.reply({ components: [errPanel("Texte invalide ou trop long après conversion.")], flags: FLAGS_V2 });
    return;
  }
  await ix.reply({ components: [panel([textBlock(out)])], flags: FLAGS_V2 });
}

// ---------------------------------------------------------------------------
// Inverser
// ---------------------------------------------------------------------------

async function runInverser(ix: AnyIx, texte: string): Promise<void> {
  const inverse = [...texte].reverse().join("");
  if (inverse.length === 0) {
    await ix.reply({ components: [errPanel("Texte vide.")], flags: FLAGS_V2 });
    return;
  }
  await ix.reply({ components: [panel([textBlock(`🔄 \`${texte}\`\n\n## ${inverse}`)])], flags: FLAGS_V2 });
}

// ---------------------------------------------------------------------------
// ASCII
// ---------------------------------------------------------------------------

const ASCII_FONT: Record<string, string[]> = {
  A: [" ### ", "#   #", "#####", "#   #", "#   #"],
  B: ["#### ", "#   #", "#### ", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  F: ["#####", "#    ", "#### ", "#    ", "#    "],
  G: [" ####", "#    ", "#  ##", "#   #", " ####"],
  H: ["#   #", "#   #", "#####", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["  ###", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "###  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#### ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#### ", "#  # ", "#   #"],
  S: [" ####", "#    ", " ### ", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
  X: ["#   #", " # # ", "  #  ", " # # ", "#   #"],
  Y: ["#   #", " # # ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "   # ", "  #  ", " #   ", "#####"],
  "0": [" ### ", "#  ##", "# # #", "##  #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "   # ", "  #  ", "#####"],
  "3": ["#### ", "    #", " ### ", "    #", "#### "],
  "4": ["#   #", "#   #", "#####", "    #", "    #"],
  "5": ["#####", "#    ", "#### ", "    #", "#### "],
  "6": [" ### ", "#    ", "#### ", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", " #   "],
  "8": [" ### ", "#   #", " ### ", "#   #", " ### "],
  "9": [" ### ", "#   #", " ####", "    #", " ### "],
  " ": ["     ", "     ", "     ", "     ", "     "],
  "!": ["  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "   # ", "     ", "  #  "],
  "-": ["     ", "     ", "#####", "     ", "     "],
};

async function runAscii(ix: AnyIx, texte: string): Promise<void> {
  const up = texte.toUpperCase();
  if (!/^[A-Z0-9 !?\-]{1,10}$/.test(up)) {
    await ix.reply({ components: [errPanel("Caractères autorisés : A-Z, 0-9, espace, ! ? -.")], flags: FLAGS_V2 });
    return;
  }
  const rows: string[] = ["", "", "", "", ""];
  for (const ch of up) {
    const glyph = ASCII_FONT[ch] ?? ASCII_FONT[" "]!;
    for (let r = 0; r < 5; r++) rows[r] += glyph[r] + " ";
  }
  const art = rows.map((r) => r.replace(/ +$/, "")).join("\n");
  await ix.reply({ components: [panel([textBlock(`\`\`\`\n${art}\n\`\`\``)])], flags: FLAGS_V2 });
}

// ---------------------------------------------------------------------------
// Boule magique
// ---------------------------------------------------------------------------

const BOULE_REPONSES = [
  "C'est certain. 🔮",
  "Sans aucun doute. ✅",
  "Oui, définitivement. 👍",
  "Tu peux compter dessus. 💪",
  "Très probablement. 😌",
  "Oui. ✨",
  "Les signes disent oui. 🌟",
  "C'est flou, réessaie. 🌫️",
  "Demande à nouveau plus tard. ⏳",
  "Mieux vaut ne pas te le dire maintenant. 🤫",
  "Impossible à prédire pour l'instant. 🎲",
  "Concentre-toi et redemande. 🧘",
  "N'y compte pas. 🚫",
  "Ma réponse est non. ❌",
  "Mes sources disent non. 📉",
  "Les perspectives ne sont pas bonnes. 🌧️",
  "Très douteux. 🤨",
  "Non, définitivement pas. 🙅",
  "Peut-être… qui sait ? 🤷",
  "Absolument pas, oublie ça. 💀",
];

async function runBoule8(ix: AnyIx, question: string): Promise<void> {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const reponse = BOULE_REPONSES[new DataView(bytes.buffer).getUint32(0) % BOULE_REPONSES.length]!;
  await ix.reply({
    components: [panel([textBlock(`🎱 **${ix.user} demande :**\n> *${question}*\n\n## ${reponse}`)], 0x9b59b6)],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Dés
// ---------------------------------------------------------------------------

async function runDe(ix: AnyIx, faces: number, nombre: number): Promise<void> {
  const bytes = new Uint8Array(nombre * 4);
  crypto.getRandomValues(bytes);
  const view = new DataView(bytes.buffer);
  const jets: number[] = [];
  for (let i = 0; i < nombre; i++) jets.push((view.getUint32(i * 4) % faces) + 1);
  const total = jets.reduce((a, b) => a + b, 0);
  const detail = nombre > 1 ? `\n> Détail : ${jets.map((j) => `\`${j}\``).join(" + ")}` : "";
  await ix.reply({
    components: [okPanel(`🎲 **${ix.user}** lance ${nombre} dé${nombre > 1 ? "s" : ""} à ${faces} faces…\n\n## 🎯 ${total}${detail}`)],
    flags: FLAGS_V2,
  });
}

// ---------------------------------------------------------------------------
// Shifumi
// ---------------------------------------------------------------------------

const COUPS = ["pierre", "feuille", "ciseaux"] as const;
type Coup = (typeof COUPS)[number];
const COUP_EMOJI: Record<Coup, string> = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" };
const COUP_BAT: Record<Coup, Coup> = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" };

function shifumiNonce(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function shifumiChoixBot(): Coup {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return COUPS[b[0]! % 3]!;
}

function shifumiBoutons(nonce: string, desactive = false, choixJoueur?: Coup, choixB?: Coup) {
  return actionRow(
    ...COUPS.map((c) =>
      button(
        `${CMD}:shifumi:coup:${c}:${nonce}`,
        `${COUP_EMOJI[c]} ${c[0]!.toUpperCase() + c.slice(1)}${choixJoueur === c ? " ← toi" : ""}${choixB === c ? " ← bot" : ""}`,
        c === "pierre" ? ButtonStyle.Primary : c === "feuille" ? ButtonStyle.Success : ButtonStyle.Danger,
        undefined,
        desactive
      )
    )
  );
}

async function runShifumi(ix: AnyIx): Promise<void> {
  await ix.reply({
    components: [panel([textBlock("## ✊✋✌️ Shifumi\nChoisis ton coup :")]), shifumiBoutons(shifumiNonce())],
    flags: FLAGS_V2,
  });
}

async function handleShifumiCoup(interaction: MessageComponentInteraction, joueur: string): Promise<void> {
  if (!interaction.isButton()) return;
  if (!COUPS.includes(joueur as Coup)) return;
  const j = joueur as Coup;
  const bot = shifumiChoixBot();
  let resultat: string;
  if (j === bot) resultat = "🤝 **Égalité !**";
  else if (COUP_BAT[j] === bot) resultat = "🎉 **Tu gagnes !**";
  else resultat = "🤖 **Le bot gagne !**";

  await interaction.update({
    components: [
      panel([textBlock(`## ✊✋✌️ Shifumi\n\n${COUP_EMOJI[j]} **Toi :** ${j} — ${COUP_EMOJI[bot]} **Bot :** ${bot}\n\n${resultat}`)]),
      shifumiBoutons(interaction.customId.split(":")[4] ?? "", true, j, bot),
    ],
  });
}

// ---------------------------------------------------------------------------
// Morpion
// ---------------------------------------------------------------------------

interface MorpionPartie {
  p1: string;
  p2: string;
  board: (null | "X" | "O")[];
  tour: string;
}

const morpionParties = new Map<string, MorpionPartie>();
const MORPION_LIGNES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function morpionGid(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function morpionGagnant(board: (null | "X" | "O")[]): "X" | "O" | "NUL" | null {
  for (const [a, b, c] of MORPION_LIGNES) {
    const v = board[a!]!;
    if (v && v === board[b!] && v === board[c!]) return v;
  }
  return board.every((v) => v !== null) ? "NUL" : null;
}

function morpionRender(p: MorpionPartie, id: string, fini: string | null) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const v = p.board[i];
      btns.push(
        button(
          `${CMD}:morpion:case:${i}:${id}`,
          v === "X" ? "❌" : v === "O" ? "⭕" : "⬜",
          v === "X" ? ButtonStyle.Primary : v === "O" ? ButtonStyle.Danger : ButtonStyle.Secondary,
          undefined,
          v !== null || fini !== null
        )
      );
    }
    rows.push(actionRow(...btns));
  }
  const tete = fini
    ? `## ⭕❌ Morpion\n\n${fini}`
    : `## ⭕❌ Morpion\n\n❌ <@${p.p1}> **vs** ⭕ <@${p.p2}>\n\n> C'est à <@${p.tour}> de jouer !`;
  return { components: [panel([textBlock(tete)]), ...rows], flags: FLAGS_V2 } as const;
}

async function runMorpion(ix: AnyIx, adv: User): Promise<void> {
  if (adv.id === ix.user.id) {
    await ix.reply({ components: [errPanel("Tu ne peux pas jouer contre toi-même !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (adv.bot) {
    await ix.reply({ components: [errPanel("Tu ne peux pas défier un bot. Essaie le shifumi pour jouer contre moi !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = morpionGid();
  const p: MorpionPartie = { p1: ix.user.id, p2: adv.id, board: Array(9).fill(null), tour: ix.user.id };
  morpionParties.set(id, p);
  setTimeout(() => morpionParties.delete(id), 15 * 60_000).unref?.();
  await ix.reply(morpionRender(p, id, null));
}

async function handleMorpionCase(interaction: MessageComponentInteraction, idxRaw: string, id: string): Promise<void> {
  if (!interaction.isButton()) return;
  const p = morpionParties.get(id);
  if (!p) {
    await interaction.reply({ components: [errPanel("Cette partie est terminée ou a expiré.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const idx = Number(idxRaw);
  if (!Number.isInteger(idx) || idx < 0 || idx > 8) return;
  if (interaction.user.id !== p.p1 && interaction.user.id !== p.p2) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ta partie !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (interaction.user.id !== p.tour) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ton tour !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (p.board[idx] !== null) return;

  p.board[idx] = interaction.user.id === p.p1 ? "X" : "O";
  const res = morpionGagnant(p.board);
  if (res === "X" || res === "O") {
    const winId = res === "X" ? p.p1 : p.p2;
    morpionParties.delete(id);
    await interaction.update(morpionRender(p, id, `🏆 <@${winId}> **remporte la partie !**`));
    return;
  }
  if (res === "NUL") {
    morpionParties.delete(id);
    await interaction.update(morpionRender(p, id, "🤝 **Match nul !**"));
    return;
  }
  p.tour = p.tour === p.p1 ? p.p2 : p.p1;
  await interaction.update(morpionRender(p, id, null));
}

// ---------------------------------------------------------------------------
// Puissance 4
// ---------------------------------------------------------------------------

const P4_LIGNES = 6;
const P4_COLS = 7;

interface P4Partie {
  p1: string;
  p2: string;
  board: (null | "R" | "J")[];
  tour: string;
}

const p4Parties = new Map<string, P4Partie>();
const P4_NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];

function p4Gid(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function p4Gagnant(board: (null | "R" | "J")[]): "R" | "J" | "NUL" | null {
  const at = (l: number, c: number): null | "R" | "J" =>
    l < 0 || l >= P4_LIGNES || c < 0 || c >= P4_COLS ? null : board[l * P4_COLS + c]!;
  for (let l = 0; l < P4_LIGNES; l++) {
    for (let c = 0; c < P4_COLS; c++) {
      const v = at(l, c);
      if (!v) continue;
      if (at(l, c + 1) === v && at(l, c + 2) === v && at(l, c + 3) === v) return v;
      if (at(l + 1, c) === v && at(l + 2, c) === v && at(l + 3, c) === v) return v;
      if (at(l + 1, c + 1) === v && at(l + 2, c + 2) === v && at(l + 3, c + 3) === v) return v;
      if (at(l + 1, c - 1) === v && at(l + 2, c - 2) === v && at(l + 3, c - 3) === v) return v;
    }
  }
  return board.every((v) => v !== null) ? "NUL" : null;
}

function p4ColonnePleine(p: P4Partie, c: number): boolean {
  return p.board[c] !== null;
}

function p4BoardText(p: P4Partie): string {
  const rows: string[] = [];
  for (let l = 0; l < P4_LIGNES; l++) {
    let row = "";
    for (let c = 0; c < P4_COLS; c++) {
      const v = p.board[l * P4_COLS + c];
      row += v === "R" ? "🔴" : v === "J" ? "🟡" : "⚪";
    }
    rows.push(row);
  }
  rows.push(P4_NUM.join(""));
  return rows.join("\n");
}

function p4Render(p: P4Partie, id: string, fini: string | null) {
  const tete = fini
    ? `## 🟡🔴 Puissance 4\n\n${fini}`
    : `## 🟡🔴 Puissance 4\n\n🔴 <@${p.p1}> **vs** 🟡 <@${p.p2}>\n\n> C'est à <@${p.tour}> de jouer ! Choisis une colonne.`;
  const cols = actionRow(
    ...Array.from({ length: P4_COLS }, (_, c) =>
      button(`${CMD}:puissance4:col:${c}:${id}`, P4_NUM[c]!, ButtonStyle.Secondary, undefined, fini !== null || p4ColonnePleine(p, c))
    )
  );
  return { components: [panel([textBlock(`${tete}\n\n${p4BoardText(p)}`)]), cols], flags: FLAGS_V2 } as const;
}

async function runPuissance4(ix: AnyIx, adv: User): Promise<void> {
  if (adv.id === ix.user.id) {
    await ix.reply({ components: [errPanel("Tu ne peux pas jouer contre toi-même !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (adv.bot) {
    await ix.reply({ components: [errPanel("Tu ne peux pas défier un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = p4Gid();
  const p: P4Partie = { p1: ix.user.id, p2: adv.id, board: Array(P4_LIGNES * P4_COLS).fill(null), tour: ix.user.id };
  p4Parties.set(id, p);
  setTimeout(() => p4Parties.delete(id), 20 * 60_000).unref?.();
  await ix.reply(p4Render(p, id, null));
}

async function handleP4Col(interaction: MessageComponentInteraction, colRaw: string, id: string): Promise<void> {
  if (!interaction.isButton()) return;
  const p = p4Parties.get(id);
  if (!p) {
    await interaction.reply({ components: [errPanel("Cette partie est terminée ou a expiré.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const col = Number(colRaw);
  if (!Number.isInteger(col) || col < 0 || col >= P4_COLS) return;
  if (interaction.user.id !== p.p1 && interaction.user.id !== p.p2) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ta partie !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (interaction.user.id !== p.tour) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ton tour !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (p4ColonnePleine(p, col)) {
    await interaction.reply({ components: [errPanel("Cette colonne est pleine !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const jeton = interaction.user.id === p.p1 ? "R" : "J";
  for (let l = P4_LIGNES - 1; l >= 0; l--) {
    if (p.board[l * P4_COLS + col] === null) {
      p.board[l * P4_COLS + col] = jeton;
      break;
    }
  }
  const res = p4Gagnant(p.board);
  if (res === "R" || res === "J") {
    const winId = res === "R" ? p.p1 : p.p2;
    p4Parties.delete(id);
    await interaction.update(p4Render(p, id, `🏆 <@${winId}> **aligne 4 jetons et remporte la partie !**`));
    return;
  }
  if (res === "NUL") {
    p4Parties.delete(id);
    await interaction.update(p4Render(p, id, "🤝 **Grille pleine — match nul !**"));
    return;
  }
  p.tour = p.tour === p.p1 ? p.p2 : p.p1;
  await interaction.update(p4Render(p, id, null));
}

// ---------------------------------------------------------------------------
// Routage composants
// ---------------------------------------------------------------------------

/** Actions du hub : directes (sans paramètre) ou via modal. */
async function runHubAction(interaction: MessageComponentInteraction, action: string): Promise<void> {
  switch (action) {
    case "serveur":
      await runServerinfo(interaction);
      return;
    case "shifumi":
      await runShifumi(interaction);
      return;
    default:
      await interaction.showModal(modalFor(action));
  }
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  const kind = parts[1];

  if (kind === "menu") {
    if (!interaction.isStringSelectMenu()) return;
    const action = interaction.values[0];
    if (!action) return;
    try {
      await runHubAction(interaction, action);
    } catch (err) {
      console.error(`[utilitaire] erreur menu ${action}`, err);
    }
    return;
  }
  if (kind === "compte" && parts[2] === "actu") {
    if (!interaction.isButton()) return;
    const targetMs = Number(parts[3]);
    if (!Number.isFinite(targetMs)) return;
    await interaction.update(renderCompte(targetMs, "Compte à rebours"));
    return;
  }
  if (kind === "shifumi" && parts[2] === "coup") {
    await handleShifumiCoup(interaction, parts[3] ?? "");
    return;
  }
  if (kind === "morpion" && parts[2] === "case") {
    await handleMorpionCase(interaction, parts[3] ?? "", parts[4] ?? "");
    return;
  }
  if (kind === "puissance4" && parts[2] === "col") {
    await handleP4Col(interaction, parts[3] ?? "", parts[4] ?? "");
    return;
  }
}

// ---------------------------------------------------------------------------
// Routage modals
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal") return;
  const action = parts[2] ?? "";

  try {
    switch (action) {
      case "avatar": {
        const raw = txt(interaction, "membre");
        const user = raw ? await resolveUser(interaction, raw) : interaction.user;
        if (!user) {
          await interaction.reply({ components: [errPanel("Membre introuvable. Mentionne-le ou colle son ID.")], flags: FLAGS_V2_EPHEMERAL });
          return;
        }
        await runAvatar(interaction, user);
        return;
      }
      case "calcul": {
        await runCalcul(interaction, txt(interaction, "expression"));
        return;
      }
      case "motdepasse": {
        const longueur = Number(txt(interaction, "longueur") || "16");
        const maj = parseOuiNon(txt(interaction, "majuscules") || "oui");
        const chi = parseOuiNon(txt(interaction, "chiffres") || "oui");
        const sym = parseOuiNon(txt(interaction, "symboles") || "non");
        if (!Number.isInteger(longueur) || longueur < 8 || longueur > 64) {
          await interaction.reply({ components: [errPanel("Longueur invalide : choisis entre 8 et 64.")], flags: FLAGS_V2_EPHEMERAL });
          return;
        }
        if (maj === null || chi === null || sym === null) {
          await interaction.reply({ components: [errPanel("Réponds « oui » ou « non » pour chaque type de caractères.")], flags: FLAGS_V2_EPHEMERAL });
          return;
        }
        await runMotdepasse(interaction, longueur, maj, chi, sym);
        return;
      }
      case "hex": {
        await runHex(interaction, txt(interaction, "couleur"));
        return;
      }
      case "timestamp": {
        const dateStr = txt(interaction, "date") || null;
        const unixRaw = txt(interaction, "unix");
        const unix = unixRaw ? Number(unixRaw) : null;
        if (unixRaw && !Number.isInteger(unix)) {
          await interaction.reply({ components: [errPanel("Timestamp invalide.")], flags: FLAGS_V2 });
          return;
        }
        await runTimestamp(interaction, dateStr, unix);
        return;
      }
      case "compte": {
        await runCompte(interaction, txt(interaction, "date"), txt(interaction, "titre"));
        return;
      }
      case "rappel": {
        await runRappel(interaction, txt(interaction, "duree"), txt(interaction, "message"));
        return;
      }
      case "choisir": {
        await runChoisir(interaction, txt(interaction, "options"));
        return;
      }
      case "emojify": {
        await runEmojify(interaction, txt(interaction, "texte"));
        return;
      }
      case "inverser": {
        await runInverser(interaction, txt(interaction, "texte"));
        return;
      }
      case "ascii": {
        await runAscii(interaction, txt(interaction, "texte"));
        return;
      }
      case "boule8": {
        await runBoule8(interaction, txt(interaction, "question"));
        return;
      }
      case "de": {
        const faces = Number(txt(interaction, "faces") || "6");
        const nombre = Number(txt(interaction, "nombre") || "1");
        if (!Number.isInteger(faces) || faces < 2 || faces > 100) {
          await interaction.reply({ components: [errPanel("Faces invalide : choisis entre 2 et 100.")], flags: FLAGS_V2 });
          return;
        }
        if (!Number.isInteger(nombre) || nombre < 1 || nombre > 20) {
          await interaction.reply({ components: [errPanel("Nombre invalide : choisis entre 1 et 20.")], flags: FLAGS_V2 });
          return;
        }
        await runDe(interaction, faces, nombre);
        return;
      }
      case "morpion": {
        const adv = await resolveUser(interaction, txt(interaction, "adversaire"));
        if (!adv) {
          await interaction.reply({ components: [errPanel("Adversaire introuvable. Mentionne-le ou colle son ID.")], flags: FLAGS_V2_EPHEMERAL });
          return;
        }
        await runMorpion(interaction, adv);
        return;
      }
      case "puissance4": {
        const adv = await resolveUser(interaction, txt(interaction, "adversaire"));
        if (!adv) {
          await interaction.reply({ components: [errPanel("Adversaire introuvable. Mentionne-le ou colle son ID.")], flags: FLAGS_V2_EPHEMERAL });
          return;
        }
        await runPuissance4(interaction, adv);
        return;
      }
      default:
        return;
    }
  } catch (err) {
    console.error(`[utilitaire] erreur modal ${action}`, err);
  }
}
