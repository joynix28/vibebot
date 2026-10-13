import {
  SlashCommandBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  okPanel,
  errPanel,
  textBlock,
  sepBlock,
  actionRow,
  button,
  ACCENT,
  GOLD,
  GREEN,
  RED,
} from "../../../core/ui.ts";
import {
  getUser,
  getConfig,
  fmt,
  isValidAmount,
  MAX_AMOUNT,
  creditWallet,
  debitWallet,
  walletToBank,
  bankToWallet,
  transferWallet,
  cooldownRemainingMs,
  setCooldown,
  formatDuration,
  CD_DAILY_MS,
  CD_WORK_MS,
  CD_CRIME_MS,
  CD_ROB_MS,
  listShop,
  buyItem,
  getInventory,
  topRichest,
  saveGame,
  getGame,
  deleteGame,
} from "../func/db.ts";

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function guildIdOf(i: ChatInputCommandInteraction | MessageComponentInteraction): string | null {
  return i.guild?.id ?? null;
}

async function needGuild(i: ChatInputCommandInteraction): Promise<string | null> {
  if (!i.guild) {
    await i.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return null;
  }
  return i.guild.id;
}

// ---------------------------------------------------------------------------
// Définition de la commande
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("economie")
  .setDescription("Monnaie du serveur, boutique et casino.")
  .addSubcommand((s) => s.setName("solde").setDescription("Affiche ton portefeuille et ta banque.")
    .addUserOption((o) => o.setName("membre").setDescription("Voir le solde d'un autre membre.")))
  .addSubcommand((s) => s.setName("quotidien").setDescription("Récupère ta récompense quotidienne."))
  .addSubcommand((s) => s.setName("travailler").setDescription("Travaille pour gagner des pièces (1h de cooldown)."))
  .addSubcommand((s) => s.setName("payer").setDescription("Transfère des pièces à un membre.")
    .addUserOption((o) => o.setName("membre").setDescription("Le destinataire.").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant à transférer.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("depot").setDescription("Dépose des pièces à la banque (protégées des vols).")
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant à déposer.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("retrait").setDescription("Retire des pièces de ta banque.")
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant à retirer.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("boutique").setDescription("Affiche la boutique du serveur."))
  .addSubcommand((s) => s.setName("acheter").setDescription("Achète un objet de la boutique.")
    .addStringOption((o) => o.setName("objet").setDescription("Identifiant de l'objet.").setRequired(true)))
  .addSubcommand((s) => s.setName("inventaire").setDescription("Affiche ton inventaire."))
  .addSubcommand((s) => s.setName("classement").setDescription("Top 10 des plus riches du serveur."))
  .addSubcommand((s) => s.setName("crime").setDescription("Commet un crime : gros gain ou amende (30 min de cooldown)."))
  .addSubcommand((s) => s.setName("voler").setDescription("Vole le portefeuille d'un membre (risqué, 2h de cooldown).")
    .addUserOption((o) => o.setName("membre").setDescription("Ta victime.").setRequired(true)))
  .addSubcommand((s) => s.setName("parier").setDescription("Pile ou face : double ta mise ou perds-la.")
    .addStringOption((o) => o.setName("choix").setDescription("Ton choix.").setRequired(true)
      .addChoices({ name: "🪙 Pile", value: "pile" }, { name: "👑 Face", value: "face" }))
    .addIntegerOption((o) => o.setName("mise").setDescription("Ta mise.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("slots").setDescription("Machine à sous.")
    .addIntegerOption((o) => o.setName("mise").setDescription("Ta mise.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("blackjack").setDescription("Blackjack contre la banque (21).")
    .addIntegerOption((o) => o.setName("mise").setDescription("Ta mise.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("roulette").setDescription("Roulette : rouge/noir (x2) ou vert (x14).")
    .addStringOption((o) => o.setName("couleur").setDescription("Ta couleur.").setRequired(true)
      .addChoices({ name: "🔴 Rouge", value: "rouge" }, { name: "⚫ Noir", value: "noir" }, { name: "🟢 Vert (zéro)", value: "vert" }))
    .addIntegerOption((o) => o.setName("mise").setDescription("Ta mise.").setRequired(true).setMinValue(1)));

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = await needGuild(interaction);
  if (!guildId) return;
  const sub = interaction.options.getSubcommand();
  const uid = interaction.user.id;

  switch (sub) {
    case "solde": return cmdSolde(interaction, guildId);
    case "quotidien": return cmdQuotidien(interaction, guildId, uid);
    case "travailler": return cmdTravailler(interaction, guildId, uid);
    case "payer": return cmdPayer(interaction, guildId, uid);
    case "depot": return cmdDepot(interaction, guildId, uid);
    case "retrait": return cmdRetrait(interaction, guildId, uid);
    case "boutique": return cmdBoutique(interaction, guildId);
    case "acheter": return cmdAcheter(interaction, guildId, uid);
    case "inventaire": return cmdInventaire(interaction, guildId, uid);
    case "classement": return cmdClassement(interaction, guildId);
    case "crime": return cmdCrime(interaction, guildId, uid);
    case "voler": return cmdVoler(interaction, guildId, uid);
    case "parier": return cmdParier(interaction, guildId, uid);
    case "slots": return cmdSlots(interaction, guildId, uid);
    case "blackjack": return cmdBlackjack(interaction, guildId, uid);
    case "roulette": return cmdRoulette(interaction, guildId, uid);
    default:
      await interaction.reply({ components: [errPanel("Sous-commande inconnue.")], flags: FLAGS_V2_EPHEMERAL });
  }
}

// ---------------------------------------------------------------------------
// Sous-commandes
// ---------------------------------------------------------------------------

async function cmdSolde(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const target = interaction.options.getUser("membre") ?? interaction.user;
  const u = getUser(guildId, target.id);
  const cfg = getConfig(guildId);
  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 💰 Solde de ${target}\nPortefeuille : **${u.wallet.toLocaleString("fr-FR")}** ${cfg.currency_name}\nBanque : **${u.bank.toLocaleString("fr-FR")}** ${cfg.currency_name}\nFortune totale : **${(u.wallet + u.bank).toLocaleString("fr-FR")}** ${cfg.currency_name}`
      )
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(target.displayAvatarURL()).setDescription(`Avatar de ${target.username}`)
    );
  const container = new ContainerBuilder()
    .setAccentColor(GOLD)
    .addSectionComponents(section);
  await interaction.reply({ components: [container], flags: FLAGS_V2_EPHEMERAL });
}

async function cmdQuotidien(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_daily", CD_DAILY_MS);
  if (rest > 0) {
    await interaction.reply({
      components: [errPanel(`⏳ Tu as déjà récupéré ton quotidien. Reviens dans **${formatDuration(rest)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const amount = getConfig(guildId).daily_amount;
  creditWallet(guildId, uid, amount);
  setCooldown(guildId, uid, "last_daily");
  await interaction.reply({
    components: [okPanel(`🎁 Récompense quotidienne : **+${fmt(guildId, amount)}** !\nReviens demain pour la prochaine.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

const JOBS = [
  "développeur freelance", "livreur à vélo", "streamer", "boulanger", "jardinier",
  "chauffeur VTC", "pâtissier", "graphiste", "plombier", "professeur particulier",
];

async function cmdTravailler(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_work", CD_WORK_MS);
  if (rest > 0) {
    await interaction.reply({
      components: [errPanel(`😮‍💨 Repose-toi un peu ! Tu pourras retravailler dans **${formatDuration(rest)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const cfg = getConfig(guildId);
  const gain = randInt(cfg.work_min, cfg.work_max);
  const job = JOBS[randInt(0, JOBS.length - 1)]!;
  creditWallet(guildId, uid, gain);
  setCooldown(guildId, uid, "last_work");
  await interaction.reply({
    components: [okPanel(`💼 Tu as travaillé comme **${job}** et gagné **+${fmt(guildId, gain)}** !`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdPayer(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const target = interaction.options.getUser("membre", true);
  const montant = interaction.options.getInteger("montant", true);
  if (target.id === uid) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas te payer toi-même.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.bot) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas payer un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!transferWallet(guildId, uid, target.id, montant)) {
    await interaction.reply({
      components: [errPanel(`Solde insuffisant : il te faut **${fmt(guildId, montant)}** dans ton portefeuille.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [okPanel(`💸 Tu as envoyé **${fmt(guildId, montant)}** à ${target}.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdDepot(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const montant = interaction.options.getInteger("montant", true);
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!walletToBank(guildId, uid, montant)) {
    await interaction.reply({
      components: [errPanel(`Solde insuffisant dans ton portefeuille pour déposer **${fmt(guildId, montant)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [okPanel(`🏦 **${fmt(guildId, montant)}** déposés à la banque. Ils sont à l'abri des voleurs !`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdRetrait(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const montant = interaction.options.getInteger("montant", true);
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (!bankToWallet(guildId, uid, montant)) {
    await interaction.reply({
      components: [errPanel(`Ta banque ne contient pas **${fmt(guildId, montant)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [okPanel(`💵 **${fmt(guildId, montant)}** retirés de ta banque.`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdBoutique(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const items = listShop(guildId);
  if (items.length === 0) {
    await interaction.reply({
      components: [panel([textBlock("🛒 La boutique est vide pour le moment.\nUn administrateur peut ajouter des objets avec `/eco-admin boutique-ajouter`.")], ACCENT)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = items.map((it, i) => `${i + 1}. **${it.name}** — \`${it.item_id}\`\n   💲 ${fmt(guildId, it.price)}${it.description ? ` — *${it.description}*` : ""}`);
  await interaction.reply({
    components: [panel([textBlock(`## 🛒 Boutique\n\n${lines.join("\n\n")}\n\n> Achète avec \`/economie acheter objet:<identifiant>\``)], GOLD)],
    flags: FLAGS_V2,
  });
}

async function cmdAcheter(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const objet = interaction.options.getString("objet", true);
  const res = buyItem(guildId, uid, objet);
  if (!res.ok) {
    await interaction.reply({
      components: [errPanel(res.item ? `Solde insuffisant : **${res.item.name}** coûte **${fmt(guildId, res.item.price)}**.` : `Objet \`${objet}\` introuvable. Vérifie l'identifiant avec \`/economie boutique\`.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [okPanel(`🛍️ Tu as acheté **${res.item!.name}** pour **${fmt(guildId, res.item!.price)}** !`)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdInventaire(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const inv = getInventory(guildId, uid);
  if (inv.length === 0) {
    await interaction.reply({
      components: [panel([textBlock("🎒 Ton inventaire est vide.\nFais un tour à la boutique avec `/economie boutique` !")], ACCENT)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const lines = inv.map((e, i) => `${i + 1}. **${e.name}** × ${e.qty}`);
  await interaction.reply({
    components: [panel([textBlock(`## 🎒 Inventaire de ${interaction.user}\n\n${lines.join("\n")}`)], ACCENT)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

const MEDALS = ["🥇", "🥈", "🥉"];

async function cmdClassement(interaction: ChatInputCommandInteraction, guildId: string): Promise<void> {
  const top = topRichest(guildId, 10);
  if (top.length === 0) {
    await interaction.reply({
      components: [panel([textBlock("📊 Personne n'a encore de pièces. Sois le premier avec `/economie quotidien` !")], ACCENT)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = top.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${r.user_id}> — **${r.total.toLocaleString("fr-FR")}** ${getConfig(guildId).currency_name}`);
  await interaction.reply({
    components: [panel([textBlock(`## 🏆 Classement des fortunes\n\n${lines.join("\n")}`)], GOLD)],
    flags: FLAGS_V2,
  });
}

async function cmdCrime(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_crime", CD_CRIME_MS);
  if (rest > 0) {
    await interaction.reply({
      components: [errPanel(`🚔 Profil bas… Tu pourras retenter un crime dans **${formatDuration(rest)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const cfg = getConfig(guildId);
  setCooldown(guildId, uid, "last_crime");
  if (Math.random() * 100 < cfg.crime_fail_pct) {
    const u = getUser(guildId, uid);
    const amende = Math.min(u.wallet, randInt(100, 300));
    if (amende > 0) debitWallet(guildId, uid, amende);
    await interaction.reply({
      components: [panel([textBlock(`## 🚨 Pris la main dans le sac !\n\nLa police t'a arrêté : amende de **-${fmt(guildId, amende)}**.`)], RED)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const gain = randInt(cfg.crime_min, cfg.crime_max);
  creditWallet(guildId, uid, gain);
  await interaction.reply({
    components: [panel([textBlock(`## 🕶️ Crime parfait !\n\nTu as braqué la banque du serveur : **+${fmt(guildId, gain)}**.\nPersonne ne t'a vu… cette fois.`)], GREEN)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function cmdVoler(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const target = interaction.options.getUser("membre", true);
  if (target.id === uid) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas te voler toi-même.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (target.bot) {
    await interaction.reply({ components: [errPanel("Impossible de voler un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const victim = getUser(guildId, target.id);
  if (victim.wallet < 200) {
    await interaction.reply({
      components: [errPanel(`${target} n'a pas assez de pièces dans son portefeuille (minimum 200).`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const rest = cooldownRemainingMs(guildId, uid, "last_rob", CD_ROB_MS);
  if (rest > 0) {
    await interaction.reply({
      components: [errPanel(`🥷 Discret… Tu pourras retenter un vol dans **${formatDuration(rest)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  setCooldown(guildId, uid, "last_rob");
  if (Math.random() < 0.4) {
    const butin = Math.floor(victim.wallet * (0.1 + Math.random() * 0.2));
    if (transferWallet(guildId, target.id, uid, butin)) {
      await interaction.reply({
        components: [panel([textBlock(`## 🥷 Vol réussi !\n\nTu as subtilisé **${fmt(guildId, butin)}** à ${target} sans te faire repérer.`)], GREEN)],
        flags: FLAGS_V2_EPHEMERAL,
      });
    } else {
      await interaction.reply({ components: [errPanel("Le vol a échoué au dernier moment…")], flags: FLAGS_V2_EPHEMERAL });
    }
    return;
  }
  // Échec : amende reversée à la victime
  const me = getUser(guildId, uid);
  const amende = Math.min(me.wallet, Math.max(50, Math.floor(me.wallet * 0.1)));
  if (amende > 0) transferWallet(guildId, uid, target.id, amende);
  await interaction.reply({
    components: [panel([textBlock(`## 🚨 Vol raté !\n\n${target} t'a surpris ! Tu lui dois **${fmt(guildId, amende)}** en dédommagement.`)], RED)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Jeux de casino
// ---------------------------------------------------------------------------

function takeBet(guildId: string, uid: string, mise: number): boolean {
  if (!isValidAmount(mise) || mise > MAX_AMOUNT) return false;
  return debitWallet(guildId, uid, mise);
}

async function cmdParier(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const choix = interaction.options.getString("choix", true);
  const mise = interaction.options.getInteger("mise", true);
  if (!takeBet(guildId, uid, mise)) {
    await interaction.reply({
      components: [errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const resultat = Math.random() < 0.5 ? "pile" : "face";
  const gagne = resultat === choix;
  if (gagne) creditWallet(guildId, uid, mise * 2);
  const emoji = resultat === "pile" ? "🪙" : "👑";
  await interaction.reply({
    components: [
      panel(
        [textBlock(`## ${emoji} ${resultat === "pile" ? "Pile" : "Face"} !\n\n${gagne ? `🎉 Bien vu ! Tu remportes **${fmt(guildId, mise * 2)}**.` : `😞 Raté… Tu perds ta mise de **${fmt(guildId, mise)}**.`}`)],
        gagne ? GREEN : RED
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

const SLOT_EMOJIS = ["🍒", "🍋", "⭐", "💎", "7️⃣"];

async function cmdSlots(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const mise = interaction.options.getInteger("mise", true);
  if (!takeBet(guildId, uid, mise)) {
    await interaction.reply({
      components: [errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const spin = () => SLOT_EMOJIS[randInt(0, SLOT_EMOJIS.length - 1)]!;
  const r = [spin(), spin(), spin()];
  let gain = 0;
  let label = "";
  if (r[0] === r[1] && r[1] === r[2]) {
    if (r[0] === "7️⃣") { gain = mise * 10; label = "JACKPOT 7️⃣7️⃣7️⃣"; }
    else if (r[0] === "💎") { gain = mise * 5; label = "Triple diamants 💎"; }
    else { gain = mise * 3; label = "Triple !"; }
  } else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) {
    gain = Math.floor(mise / 2);
    label = "Paire !";
  }
  if (gain > 0) creditWallet(guildId, uid, gain);
  await interaction.reply({
    components: [
      panel(
        [textBlock(`## 🎰 Machine à sous\n\n# ${r[0]} ${r[1]} ${r[2]}\n\n${gain > 0 ? `🎉 **${label}** — tu gagnes **${fmt(guildId, gain)}** !` : `😞 Perdu… ta mise de **${fmt(guildId, mise)}** s'envole.`}`)],
        gain > 0 ? GREEN : RED
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

async function cmdRoulette(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const couleur = interaction.options.getString("couleur", true);
  const mise = interaction.options.getInteger("mise", true);
  if (!takeBet(guildId, uid, mise)) {
    await interaction.reply({
      components: [errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const n = randInt(0, 36);
  const couleurTiree = n === 0 ? "vert" : RED_NUMBERS.has(n) ? "rouge" : "noir";
  const emojiC = n === 0 ? "🟢" : RED_NUMBERS.has(n) ? "🔴" : "⚫";
  let gain = 0;
  if (couleurTiree === couleur) {
    gain = couleur === "vert" ? mise * 14 : mise * 2;
  }
  if (gain > 0) creditWallet(guildId, uid, gain);
  await interaction.reply({
    components: [
      panel(
        [textBlock(`## 🎡 Roulette\n\nLa bille s'arrête sur **${emojiC} ${n}** (${couleurTiree}).\n\n${gain > 0 ? `🎉 Tu avais misé sur **${couleur}** : **${fmt(guildId, gain)}** remportés !` : `😞 Raté… tu avais misé sur **${couleur}**, ta mise de **${fmt(guildId, mise)}** est perdue.`}`)],
        gain > 0 ? GREEN : RED
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

// ---------------------------------------------------------------------------
// Blackjack (avec boutons)
// ---------------------------------------------------------------------------

interface BjState {
  player: string[];
  dealer: string[];
  deck: string[];
}

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function newDeck(): string[] {
  const d: string[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}`);
  for (let i = d.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}

function cardValue(card: string): number {
  const rank = card.slice(0, -1);
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function handValue(hand: string[]): number {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    total += cardValue(c);
    if (c.startsWith("A")) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function bjView(guildId: string, bet: number, st: BjState, hideDealer: boolean, footer: string): ReturnType<typeof panel> {
  const dealerShown = hideDealer ? `${st.dealer[0]} ❓` : st.dealer.join(" ");
  const dealerVal = hideDealer ? cardValue(st.dealer[0]!) : handValue(st.dealer);
  return panel(
    [
      textBlock(
        `## 🃏 Blackjack — mise : ${fmt(guildId, bet)}\n\n**Croupier** (${dealerVal}) : ${dealerShown}\n**Toi** (${handValue(st.player)}) : ${st.player.join(" ")}\n\n${footer}`
      ),
      sepBlock(false),
    ],
    ACCENT
  );
}

function bjButtons(disabled = false) {
  return actionRow(
    button("economie:bj:hit", "Tirer", ButtonStyle.Primary, "🃏", disabled),
    button("economie:bj:stand", "Rester", ButtonStyle.Success, "✋", disabled)
  );
}

async function cmdBlackjack(interaction: ChatInputCommandInteraction, guildId: string, uid: string): Promise<void> {
  const mise = interaction.options.getInteger("mise", true);
  if (!takeBet(guildId, uid, mise)) {
    await interaction.reply({
      components: [errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  if (getGame<BjState>(guildId, uid, "blackjack")) {
    // Rembourse la mise : une partie est déjà en cours
    creditWallet(guildId, uid, mise);
    await interaction.reply({
      components: [errPanel("Tu as déjà une partie de blackjack en cours. Termine-la d'abord !")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const deck = newDeck();
  const st: BjState = { player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], deck };
  const pv = handValue(st.player);
  const dv = handValue(st.dealer);

  if (dv === 21 && pv !== 21) {
    deleteGame(guildId, uid, "blackjack");
    await interaction.reply({
      components: [bjView(guildId, mise, st, false, `😞 Blackjack du croupier… Tu perds **${fmt(guildId, mise)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  if (pv === 21) {
    const win = Math.floor(mise * 2.5);
    creditWallet(guildId, uid, win);
    deleteGame(guildId, uid, "blackjack");
    await interaction.reply({
      components: [bjView(guildId, mise, st, false, `🎉 **BLACKJACK !** Tu remportes **${fmt(guildId, win)}** !`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  saveGame(guildId, uid, "blackjack", mise, st);
  await interaction.reply({
    components: [bjView(guildId, mise, st, true, "Tirer une carte ou rester ?"), bjButtons()],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function bjFinish(
  interaction: MessageComponentInteraction,
  guildId: string,
  uid: string,
  bet: number,
  st: BjState
): Promise<void> {
  while (handValue(st.dealer) < 17) st.dealer.push(st.deck.pop()!);
  const pv = handValue(st.player);
  const dv = handValue(st.dealer);
  let footer: string;
  if (dv > 21) {
    creditWallet(guildId, uid, bet * 2);
    footer = `🎉 Le croupier dépasse 21 ! Tu remportes **${fmt(guildId, bet * 2)}**.`;
  } else if (dv > pv) {
    footer = `😞 Le croupier gagne (${dv} contre ${pv}). Tu perds **${fmt(guildId, bet)}**.`;
  } else if (dv < pv) {
    creditWallet(guildId, uid, bet * 2);
    footer = `🎉 Tu gagnes (${pv} contre ${dv}) ! **${fmt(guildId, bet * 2)}** pour toi.`;
  } else {
    creditWallet(guildId, uid, bet);
    footer = `🤝 Égalité (${pv}) : ta mise de **${fmt(guildId, bet)}** t'est rendue.`;
  }
  deleteGame(guildId, uid, "blackjack");
  await interaction.update({ components: [bjView(guildId, bet, st, false, footer), bjButtons(true)] });
}

/** Gère les boutons du blackjack (customId `economie:bj:...`). */
export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guildId = guildIdOf(interaction);
  if (!guildId) return;
  const uid = interaction.user.id;
  const [, game, action] = interaction.customId.split(":");
  if (game !== "bj" || !interaction.isButton()) return;

  const saved = getGame<BjState>(guildId, uid, "blackjack");
  if (!saved) {
    await interaction.update({ components: [errPanel("Cette partie est terminée ou introuvable.")] });
    return;
  }
  const { bet, state: st } = saved;

  if (action === "hit") {
    st.player.push(st.deck.pop()!);
    const pv = handValue(st.player);
    if (pv > 21) {
      deleteGame(guildId, uid, "blackjack");
      await interaction.update({
        components: [bjView(guildId, bet, st, false, `💥 Dépassé (${pv}) ! Tu perds **${fmt(guildId, bet)}**.`), bjButtons(true)],
      });
      return;
    }
    if (pv === 21) {
      await bjFinish(interaction, guildId, uid, bet, st);
      return;
    }
    saveGame(guildId, uid, "blackjack", bet, st);
    await interaction.update({ components: [bjView(guildId, bet, st, true, "Tirer une carte ou rester ?"), bjButtons()] });
    return;
  }

  if (action === "stand") {
    await bjFinish(interaction, guildId, uid, bet, st);
    return;
  }
}
