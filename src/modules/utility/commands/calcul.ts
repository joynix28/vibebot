import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2, okPanel, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("calcul")
  .setDescription("Évalue une expression mathématique (sans eval, 100% sûr).")
  .addStringOption((o) =>
    o.setName("expression").setDescription("Ex. : (12 + 3) * 4 / 2 ^ 2").setRequired(true).setMaxLength(100)
  );

// ---------------------------------------------------------------------------
// Mini-parser maison (descente récursive). AUCUN eval / Function / import
// dynamique : seules les opérations + - * / % ^ et les parenthèses existent.
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
      return Math.pow(v, parseFactor()); // associatif à droite
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

function fmt(n: number): string {
  const r = Math.round(n * 1e10) / 1e10;
  return String(r);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const expr = interaction.options.getString("expression", true).trim();
  if (expr.length === 0 || expr.length > 100) {
    await interaction.reply({ components: [errPanel("Expression invalide (1 à 100 caractères).")], flags: FLAGS_V2 });
    return;
  }
  try {
    const result = evaluer(expr);
    await interaction.reply({
      components: [okPanel(`🧮 \`${expr}\`\n\n## = \`${fmt(result)}\``)],
      flags: FLAGS_V2,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Expression invalide.";
    await interaction.reply({ components: [errPanel(`❌ ${msg}`)], flags: FLAGS_V2 });
  }
}
