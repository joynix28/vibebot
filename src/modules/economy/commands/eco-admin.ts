import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { FLAGS_V2_EPHEMERAL, okPanel, errPanel, panel, textBlock, ACCENT } from "../../../core/ui.ts";
import {
  getUser,
  fmt,
  isValidAmount,
  MAX_AMOUNT,
  creditWallet,
  debitWallet,
  setCurrencyName,
  setDailyAmount,
  addShopItem,
  removeShopItem,
} from "../func/db.ts";

export const data = new SlashCommandBuilder()
  .setName("eco-admin")
  .setDescription("Administration de l'économie du serveur (réservé aux administrateurs).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((s) => s.setName("ajouter").setDescription("Ajoute des pièces au portefeuille d'un membre.")
    .addUserOption((o) => o.setName("membre").setDescription("Le membre.").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant à ajouter.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("retirer").setDescription("Retire des pièces du portefeuille d'un membre.")
    .addUserOption((o) => o.setName("membre").setDescription("Le membre.").setRequired(true))
    .addIntegerOption((o) => o.setName("montant").setDescription("Montant à retirer.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("definir-monnaie").setDescription("Change le nom de la monnaie du serveur.")
    .addStringOption((o) => o.setName("nom").setDescription("Nouveau nom (ex : 🪙 Pièces).").setRequired(true).setMaxLength(30)))
  .addSubcommand((s) => s.setName("definir-daily").setDescription("Change le montant de la récompense quotidienne.")
    .addIntegerOption((o) => o.setName("montant").setDescription("Nouveau montant.").setRequired(true).setMinValue(1).setMaxValue(MAX_AMOUNT)))
  .addSubcommand((s) => s.setName("boutique-ajouter").setDescription("Ajoute un objet à la boutique.")
    .addStringOption((o) => o.setName("identifiant").setDescription("ID unique (lettres, chiffres, -, _).").setRequired(true).setMaxLength(32))
    .addStringOption((o) => o.setName("nom").setDescription("Nom affiché.").setRequired(true).setMaxLength(60))
    .addIntegerOption((o) => o.setName("prix").setDescription("Prix en pièces.").setRequired(true).setMinValue(1).setMaxValue(MAX_AMOUNT))
    .addStringOption((o) => o.setName("description").setDescription("Description.").setMaxLength(200)))
  .addSubcommand((s) => s.setName("boutique-retirer").setDescription("Retire un objet de la boutique.")
    .addStringOption((o) => o.setName("identifiant").setDescription("ID de l'objet.").setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  // Double vérification : la permission est aussi contrôlée côté Discord,
  // mais on la re-vérifie ici pour ne jamais l'oublier.
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      components: [errPanel("⛔ Réservé aux administrateurs du serveur.")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const guildId = interaction.guild.id;
  const sub = interaction.options.getSubcommand();

  if (sub === "ajouter") {
    const target = interaction.options.getUser("membre", true);
    const montant = interaction.options.getInteger("montant", true);
    if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
      await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    creditWallet(guildId, target.id, montant);
    const u = getUser(guildId, target.id);
    await interaction.reply({
      components: [okPanel(`✅ **${fmt(guildId, montant)}** ajoutés à ${target}.\nNouveau portefeuille : **${fmt(guildId, u.wallet)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "retirer") {
    const target = interaction.options.getUser("membre", true);
    const montant = interaction.options.getInteger("montant", true);
    if (!isValidAmount(montant) || montant > MAX_AMOUNT) {
      await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    if (!debitWallet(guildId, target.id, montant)) {
      await interaction.reply({
        components: [errPanel(`${target} n'a pas **${fmt(guildId, montant)}** dans son portefeuille.`)],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    await interaction.reply({
      components: [okPanel(`✅ **${fmt(guildId, montant)}** retirés à ${target}.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "definir-monnaie") {
    const nom = interaction.options.getString("nom", true);
    setCurrencyName(guildId, nom);
    await interaction.reply({
      components: [okPanel(`✅ La monnaie du serveur s'appelle désormais **${nom.trim().slice(0, 30)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "definir-daily") {
    const montant = interaction.options.getInteger("montant", true);
    if (!setDailyAmount(guildId, montant)) {
      await interaction.reply({ components: [errPanel("Montant invalide.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.reply({
      components: [okPanel(`✅ La récompense quotidienne est maintenant de **${fmt(guildId, montant)}**.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "boutique-ajouter") {
    const id = interaction.options.getString("identifiant", true);
    const nom = interaction.options.getString("nom", true);
    const prix = interaction.options.getInteger("prix", true);
    const description = interaction.options.getString("description") ?? "";
    if (!addShopItem(guildId, id, nom, prix, description)) {
      await interaction.reply({
        components: [errPanel("Impossible d'ajouter cet objet (identifiant déjà utilisé ou données invalides).")],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
    await interaction.reply({
      components: [okPanel(`🛒 **${nom}** ajouté à la boutique pour **${fmt(guildId, prix)}** (id : \`${id.toLowerCase()}\`).`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  // boutique-retirer
  const id = interaction.options.getString("identifiant", true);
  if (!removeShopItem(guildId, id)) {
    await interaction.reply({
      components: [errPanel(`Aucun objet avec l'identifiant \`${id}\` dans la boutique.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.reply({
    components: [panel([textBlock(`🗑️ Objet \`${id}\` retiré de la boutique.`)], ACCENT)],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
