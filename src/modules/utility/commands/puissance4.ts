import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, panel, textBlock, actionRow, button, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("puissance4")
  .setDescription("Puissance 4 contre un autre membre.")
  .addUserOption((o) => o.setName("adversaire").setDescription("Le membre à défier.").setRequired(true));

const LIGNES = 6;
const COLS = 7;

interface Partie {
  p1: string; // 🔴 (défieur)
  p2: string; // 🟡
  board: (null | "R" | "J")[]; // 42 cases, index = ligne * 7 + col (ligne 0 = haut)
  tour: string;
}

const parties = new Map<string, Partie>();
const NUM = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];

function gid(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function gagnant(board: (null | "R" | "J")[]): "R" | "J" | "NUL" | null {
  const at = (l: number, c: number): null | "R" | "J" => (l < 0 || l >= LIGNES || c < 0 || c >= COLS ? null : board[l * COLS + c]!);
  for (let l = 0; l < LIGNES; l++) {
    for (let c = 0; c < COLS; c++) {
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

function colonnePleine(p: Partie, c: number): boolean {
  return p.board[c] !== null;
}

function boardText(p: Partie): string {
  const rows: string[] = [];
  for (let l = 0; l < LIGNES; l++) {
    let row = "";
    for (let c = 0; c < COLS; c++) {
      const v = p.board[l * COLS + c];
      row += v === "R" ? "🔴" : v === "J" ? "🟡" : "⚪";
    }
    rows.push(row);
  }
  rows.push(NUM.join(""));
  return rows.join("\n");
}

function render(p: Partie, id: string, fini: string | null) {
  const tete = fini
    ? `## 🟡🔴 Puissance 4\n\n${fini}`
    : `## 🟡🔴 Puissance 4\n\n🔴 <@${p.p1}> **vs** 🟡 <@${p.p2}>\n\n> C'est à <@${p.tour}> de jouer ! Choisis une colonne.`;
  const cols = actionRow(
    ...Array.from({ length: COLS }, (_, c) =>
      button(`puissance4:col:${c}:${id}`, NUM[c]!, ButtonStyle.Secondary, undefined, fini !== null || colonnePleine(p, c))
    )
  );
  return { components: [panel([textBlock(`${tete}\n\n${boardText(p)}`)]), cols], flags: FLAGS_V2 } as const;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adv = interaction.options.getUser("adversaire", true);
  if (adv.id === interaction.user.id) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas jouer contre toi-même !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (adv.bot) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas défier un bot.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = gid();
  const p: Partie = { p1: interaction.user.id, p2: adv.id, board: Array(LIGNES * COLS).fill(null), tour: interaction.user.id };
  parties.set(id, p);
  setTimeout(() => parties.delete(id), 20 * 60_000).unref?.();
  await interaction.reply(render(p, id, null));
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "puissance4" || parts[1] !== "col") return;
  const id = parts[3] ?? "";
  const p = parties.get(id);
  if (!p) {
    await interaction.reply({ components: [errPanel("Cette partie est terminée ou a expiré.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const col = Number(parts[2]);
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return;
  if (interaction.user.id !== p.p1 && interaction.user.id !== p.p2) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ta partie !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (interaction.user.id !== p.tour) {
    await interaction.reply({ components: [errPanel("Ce n'est pas ton tour !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (colonnePleine(p, col)) {
    await interaction.reply({ components: [errPanel("Cette colonne est pleine !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // Le jeton tombe sur la case libre la plus basse.
  const jeton = interaction.user.id === p.p1 ? "R" : "J";
  for (let l = LIGNES - 1; l >= 0; l--) {
    if (p.board[l * COLS + col] === null) {
      p.board[l * COLS + col] = jeton;
      break;
    }
  }

  const res = gagnant(p.board);
  if (res === "R" || res === "J") {
    const winId = res === "R" ? p.p1 : p.p2;
    parties.delete(id);
    await interaction.update(render(p, id, `🏆 <@${winId}> **aligne 4 jetons et remporte la partie !**`));
    return;
  }
  if (res === "NUL") {
    parties.delete(id);
    await interaction.update(render(p, id, "🤝 **Grille pleine — match nul !**"));
    return;
  }
  p.tour = p.tour === p.p1 ? p.p2 : p.p1;
  await interaction.update(render(p, id, null));
}
