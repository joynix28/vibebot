import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
} from "discord.js";

/** Interaction pouvant venir du hub /musique : commande slash, menu/bouton ou modal. */
export type HubInteraction =
  | ChatInputCommandInteraction
  | MessageComponentInteraction
  | ModalSubmitInteraction;

/** Sous-ensemble accepté par ensureQueue / canControl (sans les modals). */
export type QueueInteraction = ChatInputCommandInteraction | MessageComponentInteraction;

/** Cast sûr pour les fonctions du player depuis un submit de modal. */
export function asQueueInteraction(i: HubInteraction): QueueInteraction {
  return i as unknown as QueueInteraction;
}
