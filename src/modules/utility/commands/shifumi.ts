import { SlashCommandBuilder, ButtonStyle } from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { FLAGS_V2, panel, textBlock, actionRow, button } from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("shifumi")
  .setDescription("Pierre-feuille-ciseaux contre le bot.");

const COUPS = ["pierre", "feuille", "ciseaux"] as const;
type Coup = (typeof COUPS)[number];
const EMOJI: Record<Coup, string> = { pierre: "🪨", feuille: "📄", ciseaux: "✂️" };
const BAT: Record<Coup, Coup> = { pierre: "ciseaux", feuille: "pierre", ciseaux: "feuille" };

function nonce(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function choixBot(): Coup {
  const b = new Uint8Array(1);
  crypto.getRandomValues(b);
  return COUPS[b[0]! % 3]!;
}

function boutons(n: string, desactive = false, choixJoueur?: Coup, choixB?: Coup) {
  return actionRow(
    ...COUPS.map((c) =>
      button(
        `shifumi:coup:${c}:${n}`,
        `${EMOJI[c]} ${c[0]!.toUpperCase() + c.slice(1)}${choixJoueur === c ? " ← toi" : ""}${choixB === c ? " ← bot" : ""}`,
        c === "pierre" ? ButtonStyle.Primary : c === "feuille" ? ButtonStyle.Success : ButtonStyle.Danger,
        undefined,
        desactive
      )
    )
  );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    components: [panel([textBlock("## ✊✋✌️ Shifumi\nChoisis ton coup :")]), boutons(nonce())],
    flags: FLAGS_V2,
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isButton()) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== "shifumi" || parts[1] !== "coup") return;
  const joueur = parts[2] as Coup;
  if (!COUPS.includes(joueur)) return;

  const bot = choixBot();
  let resultat: string;
  if (joueur === bot) resultat = "🤝 **Égalité !**";
  else if (BAT[joueur] === bot) resultat = "🎉 **Tu gagnes !**";
  else resultat = "🤖 **Le bot gagne !**";

  await interaction.update({
    components: [
      panel([
        textBlock(
          `## ✊✋✌️ Shifumi\n\n${EMOJI[joueur]} **Toi :** ${joueur} — ${EMOJI[bot]} **Bot :** ${bot}\n\n${resultat}`
        ),
      ]),
      boutons(parts[3] ?? "", true, joueur, bot),
    ],
  });
}
