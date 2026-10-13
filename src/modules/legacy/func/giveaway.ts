import { ButtonStyle } from "discord.js";
import type { ActionRowBuilder, Client, ContainerBuilder, MessageActionRowComponentBuilder } from "discord.js";
import {
  actionRow,
  button,
  GOLD,
  panel,
  textBlock,
  type PanelBlock,
} from "./ui.ts";
import {
  endGiveaway,
  entryCount,
  getEntries,
  type Giveaway,
} from "./db.ts";
import { drawWinners } from "./dur.ts";

/** Bouton "Participer" : customId `giveaway:join:<id>` (routé vers cette commande). */
export function joinButton(giveawayId: number, disabled = false) {
  return button(`giveaway:join:${giveawayId}`, "Participer", ButtonStyle.Primary, "🎉", disabled);
}

function headBlock(gw: Giveaway): string {
  return `# 🎉 GIVEAWAY\n> **Lot :** ${gw.prize}`;
}

/** Message du giveaway en cours (panneau + bouton participer). */
export function giveawayComponents(gw: Giveaway): (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] {
  const count = entryCount(gw.id);
  const ends = Math.floor(gw.ends_at / 1000);
  const blocks: PanelBlock[] = [
    textBlock(
      `${headBlock(gw)}\n` +
        `> **Gagnants :** ${gw.winners_count}\n` +
        `> **Se termine :** <t:${ends}:R>\n` +
        `> **Participants :** \`${count}\``
    ),
  ];
  return [panel(blocks, GOLD), actionRow(joinButton(gw.id))];
}

/** Message du giveaway terminé (bouton désactivé). */
export function giveawayEndedComponents(gw: Giveaway, winners: string[]): (ContainerBuilder | ActionRowBuilder<MessageActionRowComponentBuilder>)[] {
  const line =
    winners.length > 0
      ? `> **Gagnant(s) :** ${winners.map((id) => `<@${id}>`).join(", ")}`
      : "> *Aucun participant, aucun gagnant.*";
  return [
    panel([textBlock(`${headBlock(gw)}\n> **Statut :** Terminé ✅\n${line}`)], GOLD),
    actionRow(joinButton(gw.id, true)),
  ];
}

/**
 * Termine un giveaway : tire les gagnants, marque `ended` en DB,
 * met à jour le message d'origine et annonce les gagnants dans le salon.
 * Retourne la liste des gagnants.
 */
export async function finishGiveaway(client: Client, gw: Giveaway): Promise<string[]> {
  const winners = drawWinners(getEntries(gw.id), Math.max(1, gw.winners_count));
  endGiveaway(gw.id);

  const channel = await client.channels.fetch(gw.channel_id).catch(() => null);
  if (channel?.isSendable()) {
    if (gw.message_id) {
      const msg = await channel.messages.fetch(gw.message_id).catch(() => null);
      if (msg) {
        await msg.edit({ components: giveawayEndedComponents(gw, winners) }).catch(() => {});
      }
    }
    const text = winners.length
      ? `# 🎉 Giveaway terminé !\n**Lot :** ${gw.prize}\n**Gagnant(s) :** ${winners.map((id) => `<@${id}>`).join(", ")}\nFélicitations ! 🎊`
      : `# 🎉 Giveaway terminé !\n**Lot :** ${gw.prize}\nAucun participant… aucun gagnant cette fois. 😢`;
    await channel.send({ components: [panel([textBlock(text)], GOLD)] }).catch(() => {});
  }
  return winners;
}
