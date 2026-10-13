import { Events, MessageFlags } from "discord.js";
import type { Interaction } from "discord.js";
import { isModuleEnabled } from "../../db.ts";

// Routeur central : les commandes slash vont vers leur commande,
// les boutons / menus / modals sont routés via le préfixe du customId
// ("commande:..." ou "commande_...") vers la commande propriétaire.

export const name = Events.InteractionCreate;

async function errOut(interaction: Interaction, msg: string): Promise<void> {
  if (!interaction.isRepliable()) return;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
  } catch {}
}

export async function execute(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command?.handleAutocomplete) return;
    try {
      await command.handleAutocomplete(interaction);
    } catch (err) {
      console.error(`[autocomplete] erreur sur /${interaction.commandName}`, err);
    }
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Commande inconnue.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (command.module && interaction.guildId && !isModuleEnabled(interaction.guildId, command.module)) {
      await interaction.reply({
        content: `Le module \`${command.module}\` est désactivé sur ce serveur. Réactive-le depuis le dashboard.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[commands] erreur sur /${interaction.commandName}`, err);
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      await errOut(interaction, `Erreur : ${message}`);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const [prefix] = interaction.customId.split(":");
    let command = prefix ? interaction.client.commands.get(prefix) : undefined;
    if (!command) {
      command = interaction.client.commands.find((c) => interaction.customId.startsWith(`${c.data.name}_`));
    }
    if (!command?.handleModal) {
      await interaction.reply({ content: "Ce formulaire n'est plus actif.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    try {
      await command.handleModal(interaction);
    } catch (err) {
      console.error(`[modals] erreur sur ${interaction.customId}`, err);
      const message = err instanceof Error ? err.message : "Erreur inattendue";
      await errOut(interaction, `Erreur : ${message}`);
    }
    return;
  }

  if (
    interaction.isButton() ||
    interaction.isStringSelectMenu() ||
    interaction.isUserSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isMentionableSelectMenu()
  ) {
    const [prefix] = interaction.customId.split(":");
    let command = prefix ? interaction.client.commands.get(prefix) : undefined;
    if (!command) {
      command = interaction.client.commands.find((c) => interaction.customId.startsWith(`${c.data.name}_`));
    }
    if (!command?.handleComponent) {
      await interaction.reply({ content: "Ce composant n'est plus actif.", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    try {
      await command.handleComponent(interaction);
    } catch (err) {
      console.error(`[components] erreur sur ${interaction.customId}`, err);
      await errOut(interaction, "Erreur lors du traitement.");
    }
  }
}
