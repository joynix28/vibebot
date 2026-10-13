import { db } from "../../../core/db.ts";

// Couche d'accès DB du module economy (casino + boutique + monnaie).
// TOUTES les requêtes sont paramétrées. Les débits sont atomiques :
// un seul UPDATE avec condition de solde (pas de lecture puis écriture).
// Les transferts multi-lignes passent par une transaction.

db.exec(`
  CREATE TABLE IF NOT EXISTS eco_users (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    wallet INTEGER NOT NULL DEFAULT 0,
    bank INTEGER NOT NULL DEFAULT 0,
    last_daily INTEGER NOT NULL DEFAULT 0,
    last_work INTEGER NOT NULL DEFAULT 0,
    last_crime INTEGER NOT NULL DEFAULT 0,
    last_rob INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS eco_shop (
    guild_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (guild_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS eco_inventory (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, item_id)
  );
  CREATE TABLE IF NOT EXISTS eco_config (
    guild_id TEXT PRIMARY KEY,
    currency_name TEXT NOT NULL DEFAULT '🪙 Pièces',
    daily_amount INTEGER NOT NULL DEFAULT 500,
    work_min INTEGER NOT NULL DEFAULT 100,
    work_max INTEGER NOT NULL DEFAULT 400,
    crime_min INTEGER NOT NULL DEFAULT 200,
    crime_max INTEGER NOT NULL DEFAULT 800,
    crime_fail_pct INTEGER NOT NULL DEFAULT 35
  );
  CREATE TABLE IF NOT EXISTS eco_games (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    game TEXT NOT NULL,
    bet INTEGER NOT NULL,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id, game)
  );
`);

// ---------------------------------------------------------------------------
// Validation des montants
// ---------------------------------------------------------------------------

/** Un montant valide : entier fini strictement positif. */
export function isValidAmount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && Number.isFinite(n) && n > 0;
}

/** Montant maximum accepté (garde-fou anti-abus). */
export const MAX_AMOUNT = 10_000_000;

// ---------------------------------------------------------------------------
// Utilisateurs
// ---------------------------------------------------------------------------

export interface EcoUser {
  guild_id: string;
  user_id: string;
  wallet: number;
  bank: number;
  last_daily: number;
  last_work: number;
  last_crime: number;
  last_rob: number;
}

function ensureUser(guildId: string, userId: string): void {
  db.run("INSERT INTO eco_users (guild_id, user_id) VALUES (?, ?) ON CONFLICT(guild_id, user_id) DO NOTHING", [
    guildId,
    userId,
  ]);
}

export function getUser(guildId: string, userId: string): EcoUser {
  ensureUser(guildId, userId);
  return db.query("SELECT * FROM eco_users WHERE guild_id = ? AND user_id = ?").get(guildId, userId) as EcoUser;
}

export function totalBalance(u: EcoUser): number {
  return u.wallet + u.bank;
}

/** Crédite le portefeuille (atomique). */
export function creditWallet(guildId: string, userId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  ensureUser(guildId, userId);
  db.run("UPDATE eco_users SET wallet = wallet + ? WHERE guild_id = ? AND user_id = ?", [amount, guildId, userId]);
  return true;
}

/**
 * Débite le portefeuille de façon atomique.
 * Retourne true si le débit a eu lieu (solde suffisant), false sinon.
 */
export function debitWallet(guildId: string, userId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  ensureUser(guildId, userId);
  const res = db.run(
    "UPDATE eco_users SET wallet = wallet - ? WHERE guild_id = ? AND user_id = ? AND wallet >= ?",
    [amount, guildId, userId, amount]
  );
  return res.changes > 0;
}

/** Débite la banque de façon atomique (même garantie que debitWallet). */
export function debitBank(guildId: string, userId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  ensureUser(guildId, userId);
  const res = db.run(
    "UPDATE eco_users SET bank = bank - ? WHERE guild_id = ? AND user_id = ? AND bank >= ?",
    [amount, guildId, userId, amount]
  );
  return res.changes > 0;
}

/**
 * Déplace un montant du portefeuille vers la banque (atomique, une seule requête).
 * Retourne true si le transfert a eu lieu.
 */
export function walletToBank(guildId: string, userId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  ensureUser(guildId, userId);
  const res = db.run(
    "UPDATE eco_users SET wallet = wallet - ?, bank = bank + ? WHERE guild_id = ? AND user_id = ? AND wallet >= ?",
    [amount, amount, guildId, userId, amount]
  );
  return res.changes > 0;
}

/**
 * Déplace un montant de la banque vers le portefeuille (atomique, une seule requête).
 */
export function bankToWallet(guildId: string, userId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  ensureUser(guildId, userId);
  const res = db.run(
    "UPDATE eco_users SET bank = bank - ?, wallet = wallet + ? WHERE guild_id = ? AND user_id = ? AND bank >= ?",
    [amount, amount, guildId, userId, amount]
  );
  return res.changes > 0;
}

const transferTx = db.transaction((guildId: string, fromId: string, toId: string, amount: number) => {
  const res = db.run(
    "UPDATE eco_users SET wallet = wallet - ? WHERE guild_id = ? AND user_id = ? AND wallet >= ?",
    [amount, guildId, fromId, amount]
  );
  if (res.changes === 0) throw new Error("insufficient");
  db.run("UPDATE eco_users SET wallet = wallet + ? WHERE guild_id = ? AND user_id = ?", [amount, guildId, toId]);
});

/**
 * Transfère un montant entre deux portefeuilles (transaction, débit conditionnel).
 * Retourne true si le transfert a eu lieu.
 */
export function transferWallet(guildId: string, fromId: string, toId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  if (fromId === toId) return false;
  ensureUser(guildId, fromId);
  ensureUser(guildId, toId);
  try {
    transferTx(guildId, fromId, toId, amount);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cooldowns (persistés en DB, timestamps ms)
// ---------------------------------------------------------------------------

export type CooldownKey = "last_daily" | "last_work" | "last_crime" | "last_rob";

const COOLDOWN_COLS: Record<CooldownKey, string> = {
  last_daily: "last_daily",
  last_work: "last_work",
  last_crime: "last_crime",
  last_rob: "last_rob",
};

/** Millisecondes restantes avant la fin du cooldown (0 = disponible). */
export function cooldownRemainingMs(guildId: string, userId: string, key: CooldownKey, cooldownMs: number): number {
  const u = getUser(guildId, userId);
  const last = u[key];
  const remaining = last + cooldownMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

/** Marque le début d'un cooldown (atomique). */
export function setCooldown(guildId: string, userId: string, key: CooldownKey): void {
  const col = COOLDOWN_COLS[key];
  ensureUser(guildId, userId);
  db.run(`UPDATE eco_users SET ${col} = ? WHERE guild_id = ? AND user_id = ?`, [Date.now(), guildId, userId]);
}

export const CD_DAILY_MS = 24 * 60 * 60 * 1000;
export const CD_WORK_MS = 60 * 60 * 1000;
export const CD_CRIME_MS = 30 * 60 * 1000;
export const CD_ROB_MS = 2 * 60 * 60 * 1000;

/** Formate une durée en ms en texte lisible FR. */
export function formatDuration(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${sec}s`;
  return `${sec}s`;
}

// ---------------------------------------------------------------------------
// Configuration du serveur
// ---------------------------------------------------------------------------

export interface EcoConfig {
  guild_id: string;
  currency_name: string;
  daily_amount: number;
  work_min: number;
  work_max: number;
  crime_min: number;
  crime_max: number;
  crime_fail_pct: number;
}

export function getConfig(guildId: string): EcoConfig {
  const row = db.query("SELECT * FROM eco_config WHERE guild_id = ?").get(guildId) as EcoConfig | null;
  if (row) return row;
  db.run("INSERT INTO eco_config (guild_id) VALUES (?) ON CONFLICT(guild_id) DO NOTHING", [guildId]);
  return db.query("SELECT * FROM eco_config WHERE guild_id = ?").get(guildId) as EcoConfig;
}

export function setCurrencyName(guildId: string, name: string): void {
  const clean = name.trim().slice(0, 30) || "🪙 Pièces";
  getConfig(guildId);
  db.run("UPDATE eco_config SET currency_name = ? WHERE guild_id = ?", [clean, guildId]);
}

export function setDailyAmount(guildId: string, amount: number): boolean {
  if (!isValidAmount(amount) || amount > MAX_AMOUNT) return false;
  getConfig(guildId);
  db.run("UPDATE eco_config SET daily_amount = ? WHERE guild_id = ?", [amount, guildId]);
  return true;
}

/** Formate un montant avec le nom de la monnaie du serveur. */
export function fmt(guildId: string, amount: number): string {
  return `${amount.toLocaleString("fr-FR")} ${getConfig(guildId).currency_name}`;
}

// ---------------------------------------------------------------------------
// Boutique
// ---------------------------------------------------------------------------

export interface ShopItem {
  guild_id: string;
  item_id: string;
  name: string;
  price: number;
  description: string;
}

export function addShopItem(guildId: string, itemId: string, name: string, price: number, description: string): boolean {
  if (!isValidAmount(price) || price > MAX_AMOUNT) return false;
  const id = itemId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const cleanName = name.trim().slice(0, 60);
  if (!id || !cleanName) return false;
  try {
    db.run("INSERT INTO eco_shop (guild_id, item_id, name, price, description) VALUES (?, ?, ?, ?, ?)", [
      guildId,
      id,
      cleanName,
      price,
      description.trim().slice(0, 200),
    ]);
    return true;
  } catch {
    return false; // item_id déjà pris
  }
}

export function removeShopItem(guildId: string, itemId: string): boolean {
  const res = db.run("DELETE FROM eco_shop WHERE guild_id = ? AND item_id = ?", [
    guildId,
    itemId.trim().toLowerCase(),
  ]);
  return res.changes > 0;
}

export function getShopItem(guildId: string, itemId: string): ShopItem | null {
  return (
    (db.query("SELECT * FROM eco_shop WHERE guild_id = ? AND item_id = ?").get(guildId, itemId.trim().toLowerCase()) as ShopItem | null) ??
    null
  );
}

export function listShop(guildId: string): ShopItem[] {
  return db.query("SELECT * FROM eco_shop WHERE guild_id = ? ORDER BY price ASC").all(guildId) as ShopItem[];
}

const buyTx = db.transaction((guildId: string, userId: string, item: ShopItem) => {
  const res = db.run(
    "UPDATE eco_users SET wallet = wallet - ? WHERE guild_id = ? AND user_id = ? AND wallet >= ?",
    [item.price, guildId, userId, item.price]
  );
  if (res.changes === 0) throw new Error("insufficient");
  db.run(
    "INSERT INTO eco_inventory (guild_id, user_id, item_id, qty) VALUES (?, ?, ?, 1) ON CONFLICT(guild_id, user_id, item_id) DO UPDATE SET qty = qty + 1",
    [guildId, userId, item.item_id]
  );
});

/** Achète un item (transaction : débit conditionnel + ajout inventaire). */
export function buyItem(guildId: string, userId: string, itemId: string): { ok: boolean; item?: ShopItem } {
  const item = getShopItem(guildId, itemId);
  if (!item) return { ok: false };
  ensureUser(guildId, userId);
  try {
    buyTx(guildId, userId, item);
    return { ok: true, item };
  } catch {
    return { ok: false, item };
  }
}

export interface InventoryEntry {
  item_id: string;
  name: string;
  price: number;
  qty: number;
}

export function getInventory(guildId: string, userId: string): InventoryEntry[] {
  return db.query(
    `SELECT i.item_id, s.name, s.price, i.qty FROM eco_inventory i
     JOIN eco_shop s ON s.guild_id = i.guild_id AND s.item_id = i.item_id
     WHERE i.guild_id = ? AND i.user_id = ? AND i.qty > 0
     ORDER BY s.price DESC`
  ).all(guildId, userId) as InventoryEntry[];
}

// ---------------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------------

export interface EcoRank {
  user_id: string;
  total: number;
  wallet: number;
  bank: number;
}

/** Top N par fortune totale (portefeuille + banque). */
export function topRichest(guildId: string, limit = 10): EcoRank[] {
  return db.query(
    "SELECT user_id, wallet, bank, (wallet + bank) AS total FROM eco_users WHERE guild_id = ? ORDER BY total DESC LIMIT ?"
  ).all(guildId, limit) as EcoRank[];
}

// ---------------------------------------------------------------------------
// Parties en cours (blackjack)
// ---------------------------------------------------------------------------

export interface EcoGame {
  guild_id: string;
  user_id: string;
  game: string;
  bet: number;
  state: string;
  created_at: number;
}

export function saveGame(guildId: string, userId: string, game: string, bet: number, state: unknown): void {
  db.run(
    "INSERT INTO eco_games (guild_id, user_id, game, bet, state, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(guild_id, user_id, game) DO UPDATE SET bet = excluded.bet, state = excluded.state, created_at = excluded.created_at",
    [guildId, userId, game, bet, JSON.stringify(state), Date.now()]
  );
}

export function getGame<T>(guildId: string, userId: string, game: string): { bet: number; state: T } | null {
  const row = db.query("SELECT bet, state FROM eco_games WHERE guild_id = ? AND user_id = ? AND game = ?").get(
    guildId,
    userId,
    game
  ) as { bet: number; state: string } | null;
  if (!row) return null;
  try {
    return { bet: row.bet, state: JSON.parse(row.state) as T };
  } catch {
    return null;
  }
}

export function deleteGame(guildId: string, userId: string, game: string): void {
  db.run("DELETE FROM eco_games WHERE guild_id = ? AND user_id = ? AND game = ?", [guildId, userId, game]);
}
