import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
  Guild,
} from "discord.js";
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

/** Fonction de réponse unifiée : reply (menu / modal). */
type Respond = (components: ContainerBuilder[], flags?: number) => Promise<unknown>;

function isAdmin(i: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): boolean {
  return !!i.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function denyAdmin(i: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction): Promise<void> {
  if (i.isRepliable()) {
    await i.reply({ components: [errPanel("⛔ Réservé aux administrateurs du serveur.")], flags: FLAGS_V2_EPHEMERAL });
  }
}

/** Résout un membre depuis une mention ou un ID Discord. */
async function resolveMember(guild: Guild, input: string): Promise<User | null> {
  const m = input.trim().match(/^<@!?(\d+)>$/) ?? input.trim().match(/^(\d{15,25})$/);
  if (!m) return null;
  try {
    const member = await guild.members.fetch(m[1]!);
    return member.user;
  } catch {
    return null;
  }
}

/** Parse un montant saisi dans un modal. */
function parseAmount(raw: string): number | null {
  const n = Number(raw.trim());
  if (!isValidAmount(n) || n > MAX_AMOUNT) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Définition de la commande (hub sans sous-commandes)
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("eco-admin")
  .setDescription("Administration de l'économie du serveur (réservé aux administrateurs).")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

const MENU_OPTIONS: { value: string; label: string; emoji: string; description: string }[] = [
  { value: "ajouter", label: "Ajouter", emoji: "➕", description: "Donner des pièces à un membre" },
  { value: "retirer", label: "Retirer", emoji: "➖", description: "Retirer des pièces à un membre" },
  { value: "definir-monnaie", label: "Monnaie", emoji: "🪙", description: "Changer le nom de la monnaie" },
  { value: "definir-daily", label: "Quotidien", emoji: "🎁", description: "Changer la récompense quotidienne" },
  { value: "boutique-ajouter", label: "Boutique +", emoji: "🛒", description: "Ajouter un objet en boutique" },
  { value: "boutique-retirer", label: "Boutique −", emoji: "🗑️", description: "Retirer un objet de la boutique" },
];

function hubMenu(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("eco-admin:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      MENU_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setEmoji(o.emoji)
          .setDescription(o.description)
      )
    );
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return new ContainerBuilder()
    .setAccentColor(ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🛠️ Administration de l'économie\nChoisis une action dans le menu ci-dessous 👇")
    )
    .addActionRowComponents(row);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  // Double vérification : la permission est aussi contrôlée côté Discord,
  // mais on la re-vérifie ici pour ne jamais l'oublier.
  if (!isAdmin(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  await interaction.reply({ components: [hubMenu()], flags: FLAGS_V2_EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function textField(id: string, label: string, max: number, placeholder?: string, required = true, paragraph = false): LabelBuilder {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(required)
    .setMaxLength(max);
  if (placeholder) input.setPlaceholder(placeholder);
  return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function modalFor(action: string): ModalBuilder | null {
  const base = (title: string) => new ModalBuilder().setCustomId(`eco-admin:modal:${action}`).setTitle(title);
  switch (action) {
    case "ajouter":
      return base("➕ Ajouter des pièces").addLabelComponents(
        textField("membre", "Membre", 60, "@pseudo ou ID Discord"),
        textField("montant", "Montant", 12, "Ex : 1000")
      );
    case "retirer":
      return base("➖ Retirer des pièces").addLabelComponents(
        textField("membre", "Membre", 60, "@pseudo ou ID Discord"),
        textField("montant", "Montant", 12, "Ex : 1000")
      );
    case "definir-monnaie":
      return base("🪙 Nom de la monnaie").addLabelComponents(
        textField("nom", "Nouveau nom", 30, "Ex : 🪙 Pièces")
      );
    case "definir-daily":
      return base("🎁 Récompense quotidienne").addLabelComponents(
        textField("montant", "Nouveau montant", 12, "Ex : 500")
      );
    case "boutique-ajouter":
      return base("🛒 Ajouter à la boutique").addLabelComponents(
        textField("identifiant", "Identifiant unique", 32, "lettres, chiffres, -, _"),
        textField("nom", "Nom affiché", 60, "Ex : Rôle VIP"),
        textField("prix", "Prix en pièces", 12, "Ex : 5000"),
        textField("description", "Description", 200, "Optionnel", false, true)
      );
    case "boutique-retirer":
      return base("🗑️ Retirer de la boutique").addLabelComponents(
        textField("identifiant", "Identifiant de l'objet", 40, "Ex : vip")
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// handleComponent
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.guild) return;
  if (!isAdmin(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  if (interaction.customId !== "eco-admin:menu" || !interaction.isStringSelectMenu()) return;
  const action = interaction.values[0] ?? "";
  const modal = modalFor(action);
  if (modal) await (interaction as StringSelectMenuInteraction).showModal(modal);
}

// ---------------------------------------------------------------------------
// handleModal
// ---------------------------------------------------------------------------

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!isAdmin(interaction)) {
    await denyAdmin(interaction);
    return;
  }
  const guildId = guild.id;
  const parts = interaction.customId.split(":"); // eco-admin:modal:<action>
  if (parts[1] !== "modal") return;
  const action = parts[2] ?? "";

  const send: Respond = (components, flags = FLAGS_V2_EPHEMERAL) =>
    interaction.reply({ components, flags });
  const field = (name: string): string => {
    try {
      return interaction.fields.getTextInputValue(name);
    } catch {
      return "";
    }
  };

  switch (action) {
    case "ajouter": {
      const target = await resolveMember(guild, field("membre"));
      if (!target) {
        await send([errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant Discord.")]);
        return;
      }
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      creditWallet(guildId, target.id, montant);
      const u = getUser(guildId, target.id);
      await send([okPanel(`✅ **${fmt(guildId, montant)}** ajoutés à ${target}.\nNouveau portefeuille : **${fmt(guildId, u.wallet)}**.`)]);
      return;
    }
    case "retirer": {
      const target = await resolveMember(guild, field("membre"));
      if (!target) {
        await send([errPanel("Membre introuvable. Mentionne-le avec @ ou colle son identifiant Discord.")]);
        return;
      }
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      if (!debitWallet(guildId, target.id, montant)) {
        await send([errPanel(`${target} n'a pas **${fmt(guildId, montant)}** dans son portefeuille.`)]);
        return;
      }
      await send([okPanel(`✅ **${fmt(guildId, montant)}** retirés à ${target}.`)]);
      return;
    }
    case "definir-monnaie": {
      const nom = field("nom").trim().slice(0, 30);
      if (!nom) {
        await send([errPanel("Indique un nom pour la monnaie.")]);
        return;
      }
      setCurrencyName(guildId, nom);
      await send([okPanel(`✅ La monnaie du serveur s'appelle désormais **${nom}**.`)]);
      return;
    }
    case "definir-daily": {
      const montant = parseAmount(field("montant"));
      if (montant === null) {
        await send([errPanel("Montant invalide (nombre entier positif).")]);
        return;
      }
      if (!setDailyAmount(guildId, montant)) {
        await send([errPanel("Montant invalide.")]);
        return;
      }
      await send([okPanel(`✅ La récompense quotidienne est maintenant de **${fmt(guildId, montant)}**.`)]);
      return;
    }
    case "boutique-ajouter": {
      const id = field("identifiant").trim();
      const nom = field("nom").trim();
      const prix = parseAmount(field("prix"));
      const description = field("description").trim();
      if (!id || !nom) {
        await send([errPanel("L'identifiant et le nom sont obligatoires.")]);
        return;
      }
      if (prix === null) {
        await send([errPanel("Prix invalide (nombre entier positif).")]);
        return;
      }
      if (!addShopItem(guildId, id, nom, prix, description)) {
        await send([errPanel("Impossible d'ajouter cet objet (identifiant déjà utilisé ou données invalides).")]);
        return;
      }
      await send([okPanel(`🛒 **${nom}** ajouté à la boutique pour **${fmt(guildId, prix)}** (id : \`${id.toLowerCase()}\`).`)]);
      return;
    }
    case "boutique-retirer": {
      const id = field("identifiant").trim();
      if (!id) {
        await send([errPanel("Indique l'identifiant de l'objet.")]);
        return;
      }
      if (!removeShopItem(guildId, id)) {
        await send([errPanel(`Aucun objet avec l'identifiant \`${id}\` dans la boutique.`)]);
        return;
      }
      await send([panel([textBlock(`🗑️ Objet \`${id}\` retiré de la boutique.`)], ACCENT)]);
      return;
    }
    default:
      return;
  }
}
