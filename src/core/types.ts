import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  AutocompleteInteraction,
  Collection,
  Client,
} from "discord.js";

/** Une commande slash du bot. */
export interface Command {
  data: SlashCommandBuilder;
  /** Renseigné automatiquement par le loader : id du module propriétaire. */
  module?: string;
  execute(interaction: ChatInputCommandInteraction): unknown;
  /** Gère les boutons / select menus dont le customId appartient à cette commande. */
  handleComponent?(interaction: MessageComponentInteraction): unknown;
  /** Gère les modals dont le customId appartient à cette commande. */
  handleModal?(interaction: ModalSubmitInteraction): unknown;
  /** Gère l'autocomplétion des options de la commande. */
  handleAutocomplete?(interaction: AutocompleteInteraction): unknown;
}

/** Un écouteur d'événement discord.js. */
export interface BotEvent {
  name: string;
  once?: boolean;
  execute(...args: any[]): unknown;
}

export interface Config {
  token: string;
  owner: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
  dashboardPort: number;
  dashboardEnabled: boolean;
}

/** Métadonnées d'un module (lu depuis src/modules/<id>/module.json). */
export interface ModuleMeta {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, Command>;
    config: Config;
  }
}
