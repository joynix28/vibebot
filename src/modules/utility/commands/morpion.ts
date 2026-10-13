import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, panel, textBlock, actionRow, button, errPanel } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("morpion")
  .setDescription("Morpion (tic-tac-toe) contre un autre membre.")
  .addUserOption((o) => o.setName("adversaire").setDescription("Le membre à défier.").setRequired(true));

interface Partie {
  p1: string; // ❌ (défieur)
  p2: string; // ⭕
  board: (null | "X" | "O")[];
  tour: string;
}

const parties = new Map<string, Partie>();
const LIGNES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function gid(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function gagnant(board: (null | "X" | "O")[]): "X" | "O" | "NUL" | null {
  for (const [a, b, c] of LIGNES) {
    const v = board[a!]!;
    if (v && v === board[b!] && v === board[c!]) return v;
  }
  return board.every((v) => v !== null) ? "NUL" : null;
}

function render(p: Partie, id: string, fini: string | null) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c;
      const v = p.board[i];
      btns.push(
        button(
          `morpion:case:${i}:${id}`,
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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adv = interaction.options.getUser("adversaire", true);
  if (adv.id === interaction.user.id) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas jouer contre toi-même !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (adv.bot) {
    await interaction.reply({ components: [errPanel("Tu ne peux pas défier un bot. Essaie `/shifumi` pour jouer contre moi !")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const id = gid();
  const p: Partie = { p1: interaction.user.id, p2: adv.id, board: Array(9).fill(null), tour: interaction.user.id };
  parties.set(id, p);
  setTimeout(() => parties.delete(id), 15 * 60_000).unref?.();
  await interaction.reply(render(p, id, null));
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "morpion" || parts[1] !== "case") return;
  const id = parts[3] ?? "";
  const p = parties.get(id);
  if (!p) {
    await interaction.reply({ components: [errPanel("Cette partie est terminée ou a expiré.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const idx = Number(parts[2]);
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
  const res = gagnant(p.board);
  if (res === "X" || res === "O") {
    const winId = res === "X" ? p.p1 : p.p2;
    parties.delete(id);
    await interaction.update(render(p, id, `🏆 <@${winId}> **remporte la partie !**`));
    return;
  }
  if (res === "NUL") {
    parties.delete(id);
    await interaction.update(render(p, id, "🤝 **Match nul !**"));
    return;
  }
  p.tour = p.tour === p.p1 ? p.p2 : p.p1;
  await interaction.update(render(p, id, null));
}
