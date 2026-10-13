import {
  SlashCommandBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  MessageActionRowComponentBuilder,
  User,
  Guild,
} from "discord.js";
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

async function needGuild(i: ChatInputCommandInteraction): Promise<string | null> {
  if (!i.guild) {
    await i.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return null;
  }
  return i.guild.id;
}

/** Fonction de réponse unifiée : followUp (menu) ou reply (modal). */
type V2Component = ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>;
type Respond = (components: V2Component[], flags?: number) => Promise<unknown>;

/** Résout un membre depuis une mention ou un ID Discord. */
async function resolveMember(guild: Guild, input: string): Promise<User | null> {
  const m = input.trim().match(/^<@!?(\d+)>$/) ?? input.trim().match(/^(\d{15,25})$/);
  if (!m) return null;
  try {
    const member = await guild.members.fetch(m[1]!);
    return member.user;
  } catch {
    return null;
  }
}

/** Parse un montant saisi dans un modal. */
function parseAmount(raw: string): number | null {
  const n = Number(raw.trim());
  if (!isValidAmount(n) || n > MAX_AMOUNT) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Définition de la commande (hub sans sous-commandes)
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("economie")
  .setDescription("Monnaie du serveur, boutique et casino.");

const MENU_OPTIONS: { value: string; label: string; emoji: string; description: string; modal: boolean }[] = [
  { value: "solde", label: "Solde", emoji: "💰", description: "Ton portefeuille et ta banque", modal: false },
  { value: "quotidien", label: "Quotidien", emoji: "🎁", description: "Ta récompense quotidienne", modal: false },
  { value: "travailler", label: "Travailler", emoji: "💼", description: "Gagne des pièces en travaillant", modal: false },
  { value: "payer", label: "Payer", emoji: "💸", description: "Envoie des pièces à un membre", modal: true },
  { value: "depot", label: "Dépôt", emoji: "🏦", description: "Protège tes pièces à la banque", modal: true },
  { value: "retrait", label: "Retrait", emoji: "💵", description: "Retire des pièces de ta banque", modal: true },
  { value: "boutique", label: "Boutique", emoji: "🛒", description: "Voir les objets en vente", modal: false },
  { value: "acheter", label: "Acheter", emoji: "🛍️", description: "Achète un objet de la boutique", modal: true },
  { value: "inventaire", label: "Inventaire", emoji: "🎒", description: "Voir tes objets possédés", modal: false },
  { value: "classement", label: "Classement", emoji: "🏆", description: "Top 10 des plus riches", modal: false },
  { value: "crime", label: "Crime", emoji: "🕶️", description: "Gros gain ou amende (risqué)", modal: false },
  { value: "voler", label: "Voler", emoji: "🥷", description: "Vole un membre (très risqué)", modal: true },
  { value: "parier", label: "Parier", emoji: "🪙", description: "Pile ou face : double ou rien", modal: true },
  { value: "casino", label: "Casino", emoji: "🎰", description: "Section casino : blackjack, roulette, slots", modal: false },
  { value: "slots", label: "Slots", emoji: "🎰", description: "Machine à sous", modal: true },
  { value: "blackjack", label: "Blackjack", emoji: "🃏", description: "Blackjack contre la banque", modal: true },
  { value: "roulette", label: "Roulette", emoji: "🎡", description: "Rouge / noir / vert", modal: true },
];

const MODAL_ACTIONS = new Set(MENU_OPTIONS.filter((o) => o.modal).map((o) => o.value));

function hubMenu(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("economie:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      MENU_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setEmoji(o.emoji)
          .setDescription(o.description)
      )
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return new ContainerBuilder()
    .setAccentColor(GOLD)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 💰 Économie\nChoisis une action dans le menu ci-dessous 👇")
    )
    .addActionRowComponents(row);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = await needGuild(interaction);
  if (!guildId) return;
  await interaction.reply({ components: [hubMenu()], flags: FLAGS_V2_EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function textField(id: string, label: string, max: number, placeholder?: string, required = true, paragraph = false): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(max);
  if (placeholder) input.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function modalFor(action: string): ModalBuilder | null {
  const base = (title: string) => new ModalBuilder().setCustomId(`economie:modal:${action}`).setTitle(title);
  switch (action) {
    case "payer":
      return base("💸 Payer un membre").addLabelComponents(
        textField("membre", "Membre", 60, "@pseudo ou ID Discord"),
        textField("montant", "Montant", 12, "Ex : 500")
      );
    case "depot":
      return base("🏦 Déposer à la banque").addLabelComponents(
        textField("montant", "Montant", 12, "Ex : 1000")
      );
    case "retrait":
      return base("💵 Retirer de la banque").addLabelComponents(
        textField("montant", "Montant", 12, "Ex : 1000")
      );
    case "acheter":
      return base("🛍️ Acheter un objet").addLabelComponents(
        textField("objet", "Identifiant de l'objet", 40, "Ex : vip")
      );
    case "voler":
      return base("🥷 Voler un membre").addLabelComponents(
        textField("membre", "Victime", 60, "@pseudo ou ID Discord")
      );
    case "parier":
      return base("🪙 Pile ou face").addLabelComponents(
        textField("choix", "Ton choix", 10, "pile ou face"),
        textField("mise", "Mise", 12, "Ex : 100")
      );
    case "slots":
      return base("🎰 Machine à sous").addLabelComponents(
        textField("mise", "Mise", 12, "Ex : 100")
      );
    case "blackjack":
      return base("🃏 Blackjack").addLabelComponents(
        textField("mise", "Mise", 12, "Ex : 100")
      );
    case "roulette":
      return base("🎡 Roulette").addLabelComponents(
        textField("couleur", "Couleur", 10, "rouge, noir ou vert"),
        textField("mise", "Mise", 12, "Ex : 100")
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// handleComponent : menu hub + boutons blackjack
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const guildId = guild.id;
  const parts = interaction.customId.split(":");

  // Boutons du blackjack : economie:bj:hit / economie:bj:stand
  if (parts[1] === "bj") {
    await handleBjButton(interaction, guildId);
    return;
  }

  // Boutons de la section casino : economie:casino:<jeu> -> ouvre le modal de mise
  if (parts[1] === "casino") {
    await handleCasinoButton(interaction);
    return;
  }

  if (interaction.customId !== "economie:menu" || !interaction.isStringSelectMenu()) return;

  const uid = interaction.user.id;
  const action = interaction.values[0] ?? "";

  // Actions avec formulaire : le modal doit être la première réponse.
  if (MODAL_ACTIONS.has(action)) {
    const modal = modalFor(action);
    if (modal) await (interaction as StringSelectMenuInteraction).showModal(modal);
    return;
  }

  await interaction.deferUpdate();
  const send: Respond = (components, flags = FLAGS_V2_EPHEMERAL) =>
    interaction.followUp({ components, flags });

  switch (action) {
    case "solde": return doSolde(guildId, interaction.user, send);
    case "casino": return doCasino(guildId, interaction.user.id, send);
    case "quotidien": return doQuotidien(guildId, uid, send);
    case "travailler": return doTravailler(guildId, uid, send);
    case "boutique": return doBoutique(guildId, send);
    case "inventaire": return doInventaire(guildId, uid, interaction.user, send);
    case "classement": return doClassement(guildId, send);
    case "crime": return doCrime(guildId, uid, send);
    default: return;
  }
}

// ---------------------------------------------------------------------------
// handleModal
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const guildId = guild.id;
  const uid = interaction.user.id;
  const parts = interaction.customId.split(":"); // economie:modal:<action>
  if (parts[1] !== "modal") return;
  const action = parts[2] ?? "";

  const send: Respond = (components, flags = FLAGS_V2_EPHEMERAL) =>
    interaction.reply({ components, flags });
  const field = (name: string): string => {
    try {
      return interaction.fields.getTextInputValue(name);
    } catch {
      return "";
    }
  };

  switch (action) {
    case "payer": {
      const target = await resolveMember(guild, field("membre"));
      if (!target) {
        await send([errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant Discord.")]);
        return;
      }
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      return doPayer(guildId, uid, target, montant, send);
    }
    case "depot": {
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      return doDepot(guildId, uid, montant, send);
    }
    case "retrait": {
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      return doRetrait(guildId, uid, montant, send);
    }
    case "acheter": {
      const objet = field("objet").trim();
      if (!objet) {
        await send([errPanel("Indique l'identifiant de l'objet.")]);
        return;
      }
      return doAcheter(guildId, uid, objet, send);
    }
    case "voler": {
      const target = await resolveMember(guild, field("membre"));
      if (!target) {
        await send([errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant Discord.")]);
        return;
      }
      return doVoler(guildId, uid, target, send);
    }
    case "parier": {
      const choix = field("choix").trim().toLowerCase();
      if (choix !== "pile" && choix !== "face") {
        await send([errPanel('Choix invalide : écris "pile" ou "face".')]);
        return;
      }
      const mise = parseAmount(field("mise"));
      if (mise === null) {
        await send([errPanel("Mise invalide (nombre entier positif).")]);
        return;
      }
      return doParier(guildId, uid, choix, mise, send);
    }
    case "slots": {
      const mise = parseAmount(field("mise"));
      if (mise === null) {
        await send([errPanel("Mise invalide (nombre entier positif).")]);
        return;
      }
      return doSlots(guildId, uid, mise, send);
    }
    case "blackjack": {
      const mise = parseAmount(field("mise"));
      if (mise === null) {
        await send([errPanel("Mise invalide (nombre entier positif).")]);
        return;
      }
      return doBlackjack(guildId, uid, mise, send);
    }
    case "roulette": {
      const couleur = field("couleur").trim().toLowerCase();
      if (couleur !== "rouge" && couleur !== "noir" && couleur !== "vert") {
        await send([errPanel('Couleur invalide : écris "rouge", "noir" ou "vert".')]);
        return;
      }
      const mise = parseAmount(field("mise"));
      if (mise === null) {
        await send([errPanel("Mise invalide (nombre entier positif).")]);
        return;
      }
      return doRoulette(guildId, uid, couleur, mise, send);
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// Section Casino : panneau avec boutons vers chaque jeu (mise via modal)
// ---------------------------------------------------------------------------

async function doCasino(guildId: string, uid: string, send: Respond): Promise<void> {
  const u = getUser(guildId, uid);
  const cfg = getConfig(guildId);
  const container = panel(
    [
      textBlock(
        `## 🎰 Casino\n\n*Portefeuille : **${u.wallet.toLocaleString("fr-FR")}** ${cfg.currency_name}*\n\n` +
          "Choisis un jeu : la mise te sera demandée juste après 👇"
      ),
    ],
    GOLD
  );
  container.addActionRowComponents(
    actionRow(
      button("economie:casino:blackjack", "Blackjack", ButtonStyle.Primary, "🃏"),
      button("economie:casino:roulette", "Roulette", ButtonStyle.Primary, "🎡"),
      button("economie:casino:slots", "Slots", ButtonStyle.Primary, "🎰")
    )
  );
  await send([container]);
}

/** Boutons economie:casino:<jeu> : ouvre le modal de mise du jeu choisi. */
async function handleCasinoButton(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isButton()) return;
  const game = interaction.customId.split(":")[2] ?? "";
  const modal = modalFor(game);
  if (modal) {
    await interaction.showModal(modal);
  }
}

// ---------------------------------------------------------------------------
// Logique métier
// ---------------------------------------------------------------------------

async function doSolde(guildId: string, target: User, send: Respond): Promise<void> {
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
  await send([container]);
}

async function doQuotidien(guildId: string, uid: string, send: Respond): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_daily", CD_DAILY_MS);
  if (rest > 0) {
    await send([errPanel(`⏳ Tu as déjà récupéré ton quotidien. Reviens dans **${formatDuration(rest)}**.`)]);
    return;
  }
  const amount = getConfig(guildId).daily_amount;
  creditWallet(guildId, uid, amount);
  setCooldown(guildId, uid, "last_daily");
  await send([okPanel(`🎁 Récompense quotidienne : **+${fmt(guildId, amount)}** !\nReviens demain pour la prochaine.`)]);
}

const JOBS = [
  "développeur freelance", "livreur à vélo", "streamer", "boulanger", "jardinier",
  "chauffeur VTC", "pâtissier", "graphiste", "plombier", "professeur particulier",
];

async function doTravailler(guildId: string, uid: string, send: Respond): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_work", CD_WORK_MS);
  if (rest > 0) {
    await send([errPanel(`😮‍💨 Repose-toi un peu ! Tu pourras retravailler dans **${formatDuration(rest)}**.`)]);
    return;
  }
  const cfg = getConfig(guildId);
  const gain = randInt(cfg.work_min, cfg.work_max);
  const job = JOBS[randInt(0, JOBS.length - 1)]!;
  creditWallet(guildId, uid, gain);
  setCooldown(guildId, uid, "last_work");
  await send([okPanel(`💼 Tu as travaillé comme **${job}** et gagné **+${fmt(guildId, gain)}** !`)]);
}

async function doPayer(guildId: string, uid: string, target: User, montant: number, send: Respond): Promise<void> {
  if (target.id === uid) {
    await send([errPanel("Tu ne peux pas te payer toi-même.")]);
    return;
  }
  if (target.bot) {
    await send([errPanel("Tu ne peux pas payer un bot.")]);
    return;
  }
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await send([errPanel("Montant invalide.")]);
    return;
  }
  if (!transferWallet(guildId, uid, target.id, montant)) {
    await send([errPanel(`Solde insuffisant : il te faut **${fmt(guildId, montant)}** dans ton portefeuille.`)]);
    return;
  }
  await send([okPanel(`💸 Tu as envoyé **${fmt(guildId, montant)}** à ${target}.`)]);
}

async function doDepot(guildId: string, uid: string, montant: number, send: Respond): Promise<void> {
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await send([errPanel("Montant invalide.")]);
    return;
  }
  if (!walletToBank(guildId, uid, montant)) {
    await send([errPanel(`Solde insuffisant dans ton portefeuille pour déposer **${fmt(guildId, montant)}**.`)]);
    return;
  }
  await send([okPanel(`🏦 **${fmt(guildId, montant)}** déposés à la banque. Ils sont à l'abri des voleurs !`)]);
}

async function doRetrait(guildId: string, uid: string, montant: number, send: Respond): Promise<void> {
  if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
    await send([errPanel("Montant invalide.")]);
    return;
  }
  if (!bankToWallet(guildId, uid, montant)) {
    await send([errPanel(`Ta banque ne contient pas **${fmt(guildId, montant)}**.`)]);
    return;
  }
  await send([okPanel(`💵 **${fmt(guildId, montant)}** retirés de ta banque.`)]);
}

async function doBoutique(guildId: string, send: Respond): Promise<void> {
  const items = listShop(guildId);
  if (items.length === 0) {
    await send(
      [panel([textBlock("🛒 La boutique est vide pour le moment.\nUn administrateur peut ajouter des objets via le menu de `/eco-admin`.")], ACCENT)],
      FLAGS_V2
    );
    return;
  }
  const lines = items.map((it, i) => `${i + 1}. **${it.name}** — \`${it.item_id}\`\n   💲 ${fmt(guildId, it.price)}${it.description ? ` — *${it.description}*` : ""}`);
  await send(
    [panel([textBlock(`## 🛒 Boutique\n\n${lines.join("\n\n")}\n\n> Achète via le menu « Acheter » avec l'identifiant de l'objet.`)], GOLD)],
    FLAGS_V2
  );
}

async function doAcheter(guildId: string, uid: string, objet: string, send: Respond): Promise<void> {
  const res = buyItem(guildId, uid, objet);
  if (!res.ok) {
    await send([
      errPanel(
        res.item
          ? `Solde insuffisant : **${res.item.name}** coûte **${fmt(guildId, res.item.price)}**.`
          : `Objet \`${objet}\` introuvable. Vérifie l'identifiant via le menu « Boutique ».`
      ),
    ]);
    return;
  }
  await send([okPanel(`🛍️ Tu as acheté **${res.item!.name}** pour **${fmt(guildId, res.item!.price)}** !`)]);
}

async function doInventaire(guildId: string, uid: string, viewer: User, send: Respond): Promise<void> {
  const inv = getInventory(guildId, uid);
  if (inv.length === 0) {
    await send([panel([textBlock("🎒 Ton inventaire est vide.\nFais un tour à la boutique via le menu « Boutique » !")], ACCENT)]);
    return;
  }
  const lines = inv.map((e, i) => `${i + 1}. **${e.name}** × ${e.qty}`);
  await send([panel([textBlock(`## 🎒 Inventaire de ${viewer}\n\n${lines.join("\n")}`)], ACCENT)]);
}

const MEDALS = ["🥇", "🥈", "🥉"];

async function doClassement(guildId: string, send: Respond): Promise<void> {
  const top = topRichest(guildId, 10);
  if (top.length === 0) {
    await send(
      [panel([textBlock("📊 Personne n'a encore de pièces. Sois le premier via le menu « Quotidien » !")], ACCENT)],
      FLAGS_V2
    );
    return;
  }
  const lines = top.map((r, i) => `${MEDALS[i] ?? `**${i + 1}.**`} <@${r.user_id}> — **${r.total.toLocaleString("fr-FR")}** ${getConfig(guildId).currency_name}`);
  await send([panel([textBlock(`## 🏆 Classement des fortunes\n\n${lines.join("\n")}`)], GOLD)], FLAGS_V2);
}

async function doCrime(guildId: string, uid: string, send: Respond): Promise<void> {
  const rest = cooldownRemainingMs(guildId, uid, "last_crime", CD_CRIME_MS);
  if (rest > 0) {
    await send([errPanel(`🚔 Profil bas… Tu pourras retenter un crime dans **${formatDuration(rest)}**.`)]);
    return;
  }
  const cfg = getConfig(guildId);
  setCooldown(guildId, uid, "last_crime");
  if (Math.random() * 100 < cfg.crime_fail_pct) {
    const u = getUser(guildId, uid);
    const amende = Math.min(u.wallet, randInt(100, 300));
    if (amende > 0) debitWallet(guildId, uid, amende);
    await send([panel([textBlock(`## 🚨 Pris la main dans le sac !\n\nLa police t'a arrêté : amende de **-${fmt(guildId, amende)}**.`)], RED)]);
    return;
  }
  const gain = randInt(cfg.crime_min, cfg.crime_max);
  creditWallet(guildId, uid, gain);
  await send([panel([textBlock(`## 🕶️ Crime parfait !\n\nTu as braqué la banque du serveur : **+${fmt(guildId, gain)}**.\nPersonne ne t'a vu… cette fois.`)], GREEN)]);
}

async function doVoler(guildId: string, uid: string, target: User, send: Respond): Promise<void> {
  if (target.id === uid) {
    await send([errPanel("Tu ne peux pas te voler toi-même.")]);
    return;
  }
  if (target.bot) {
    await send([errPanel("Impossible de voler un bot.")]);
    return;
  }
  const victim = getUser(guildId, target.id);
  if (victim.wallet < 200) {
    await send([errPanel(`${target} n'a pas assez de pièces dans son portefeuille (minimum 200).`)]);
    return;
  }
  const rest = cooldownRemainingMs(guildId, uid, "last_rob", CD_ROB_MS);
  if (rest > 0) {
    await send([errPanel(`🥷 Discret… Tu pourras retenter un vol dans **${formatDuration(rest)}**.`)]);
    return;
  }
  setCooldown(guildId, uid, "last_rob");
  if (Math.random() < 0.4) {
    const butin = Math.floor(victim.wallet * (0.1 + Math.random() * 0.2));
    if (transferWallet(guildId, target.id, uid, butin)) {
      await send([panel([textBlock(`## 🥷 Vol réussi !\n\nTu as subtilisé **${fmt(guildId, butin)}** à ${target} sans te faire repérer.`)], GREEN)]);
    } else {
      await send([errPanel("Le vol a échoué au dernier moment…")]);
    }
    return;
  }
  const me = getUser(guildId, uid);
  const amende = Math.min(me.wallet, Math.max(50, Math.floor(me.wallet * 0.1)));
  if (amende > 0) transferWallet(guildId, uid, target.id, amende);
  await send([panel([textBlock(`## 🚨 Vol raté !\n\n${target} t'a surpris ! Tu lui dois **${fmt(guildId, amende)}** en dédommagement.`)], RED)]);
}

// ---------------------------------------------------------------------------
// Jeux de casino
// ---------------------------------------------------------------------------

function takeBet(guildId: string, uid: string, mise: number): boolean {
  if (!isValidAmount(mise) || mise > MAX_AMOUNT) return false;
  return debitWallet(guildId, uid, mise);
}

async function doParier(guildId: string, uid: string, choix: string, mise: number, send: Respond): Promise<void> {
  if (!takeBet(guildId, uid, mise)) {
    await send([errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)]);
    return;
  }
  const resultat = Math.random() < 0.5 ? "pile" : "face";
  const gagne = resultat === choix;
  if (gagne) creditWallet(guildId, uid, mise * 2);
  const emoji = resultat === "pile" ? "🪙" : "👑";
  await send([
    panel(
      [textBlock(`## ${emoji} ${resultat === "pile" ? "Pile" : "Face"} !\n\n${gagne ? `🎉 Bien vu ! Tu remportes **${fmt(guildId, mise * 2)}**.` : `😞 Raté… Tu perds ta mise de **${fmt(guildId, mise)}**.`}`)],
      gagne ? GREEN : RED
    ),
  ]);
}

const SLOT_EMOJIS = ["🍒", "🍋", "⭐", "💎", "7️⃣"];

async function doSlots(guildId: string, uid: string, mise: number, send: Respond): Promise<void> {
  if (!takeBet(guildId, uid, mise)) {
    await send([errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)]);
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
  await send([
    panel(
      [textBlock(`## 🎰 Machine à sous\n\n# ${r[0]} ${r[1]} ${r[2]}\n\n${gain > 0 ? `🎉 **${label}** — tu gagnes **${fmt(guildId, gain)}** !` : `😞 Perdu… ta mise de **${fmt(guildId, mise)}** s'envole.`}`)],
      gain > 0 ? GREEN : RED
    ),
  ]);
}

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

async function doRoulette(guildId: string, uid: string, couleur: string, mise: number, send: Respond): Promise<void> {
  if (!takeBet(guildId, uid, mise)) {
    await send([errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)]);
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
  await send([
    panel(
      [textBlock(`## 🎡 Roulette\n\nLa bille s'arrête sur **${emojiC} ${n}** (${couleurTiree}).\n\n${gain > 0 ? `🎉 Tu avais misé sur **${couleur}** : **${fmt(guildId, gain)}** remportés !` : `😞 Raté… tu avais misé sur **${couleur}**, ta mise de **${fmt(guildId, mise)}** est perdue.`}`)],
      gain > 0 ? GREEN : RED
    ),
  ]);
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

async function doBlackjack(
  guildId: string,
  uid: string,
  mise: number,
  send: Respond
): Promise<void> {
  if (!takeBet(guildId, uid, mise)) {
    await send([errPanel(!isValidAmount(mise) ? "Mise invalide." : `Solde insuffisant pour miser **${fmt(guildId, mise)}**.`)]);
    return;
  }
  if (getGame<BjState>(guildId, uid, "blackjack")) {
    creditWallet(guildId, uid, mise);
    await send([errPanel("Tu as déjà une partie de blackjack en cours. Termine-la d'abord !")]);
    return;
  }
  const deck = newDeck();
  const st: BjState = { player: [deck.pop()!, deck.pop()!], dealer: [deck.pop()!, deck.pop()!], deck };
  const pv = handValue(st.player);
  const dv = handValue(st.dealer);

  if (dv === 21 && pv !== 21) {
    deleteGame(guildId, uid, "blackjack");
    await send([bjView(guildId, mise, st, false, `😞 Blackjack du croupier… Tu perds **${fmt(guildId, mise)}**.`)]);
    return;
  }
  if (pv === 21) {
    const win = Math.floor(mise * 2.5);
    creditWallet(guildId, uid, win);
    deleteGame(guildId, uid, "blackjack");
    await send([bjView(guildId, mise, st, false, `🎉 **BLACKJACK !** Tu remportes **${fmt(guildId, win)}** !`)]);
    return;
  }
  saveGame(guildId, uid, "blackjack", mise, st);
  await send([bjView(guildId, mise, st, true, "Tirer une carte ou rester ?"), bjButtons()]);
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
async function handleBjButton(interaction: MessageComponentInteraction, guildId: string): Promise<void> {
  const uid = interaction.user.id;
  const [, , action] = interaction.customId.split(":");
  if (!interaction.isButton()) return;

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
