import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  GuildMember,
  TextBasedChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  ACCENT,
  msgPanel,
  okPanel,
  errPanel,
  panel,
  textBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { getWelcome, setWelcome, clearWelcome } from "../func/db-gestion.ts";
import type { WelcomeConfig } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Configure les messages de bienvenue et d'au revoir.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const DEFAULT_JOIN = "🎉 Bienvenue {user} sur **{server}** ! Tu es notre {membercount}e membre.";
export const DEFAULT_LEAVE = "👋 {user} nous a quittés. Bon vent !";

/** Remplace {user}, {server} et {membercount} dans un template. */
export function renderWelcome(template: string, member: GuildMember): string {
  return template
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{membercount}", String(member.guild.memberCount));
}

export async function sendWelcomeMessage(channel: TextBasedChannel, text: string, embed: boolean): Promise<void> {
  if (!channel.isSendable()) return;
  if (embed) {
    await channel.send({ components: [msgPanel(text, BLUE)], flags: FLAGS_V2 });
  } else {
    await channel.send(text);
  }
}

function hubContainer() {
  const container = panel([textBlock("## 👋 Bienvenue & au revoir\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("welcome:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Configurer les messages")
        .setValue("set")
        .setDescription("Salon, textes de bienvenue et d'au revoir.")
        .setEmoji("⚙️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Voir la configuration")
        .setValue("show")
        .setDescription("Affiche la configuration actuelle.")
        .setEmoji("👁️"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Envoyer un test")
        .setValue("test")
        .setDescription("Envoie un message de test.")
        .setEmoji("🧪"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Réinitialiser")
        .setValue("reset")
        .setDescription("Supprime la configuration.")
        .setEmoji("🗑️")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "welcome:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const action = interaction.values[0];

  if (action === "set") {
    const modal = new ModalBuilder().setCustomId("welcome:modal:set").setTitle("Messages de bienvenue");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Salon")
        .setDescription("Mentionne le salon ou colle son ID.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)
        ),
      new LabelBuilder()
        .setLabel("Message de bienvenue (optionnel)")
        .setDescription("Variables : {user} {server} {membercount}")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("bienvenue").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500)
        ),
      new LabelBuilder()
        .setLabel("Message d'au revoir (optionnel)")
        .setDescription("Variables : {user} {server} {membercount}")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("aurevoir").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500)
        ),
      new LabelBuilder()
        .setLabel("Panneau (optionnel)")
        .setDescription("« oui » ou « non ». Défaut : oui.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("panneau").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(3)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "show") {
    const cfg = getWelcome(guild.id);
    if (!cfg?.channelId) {
      await interaction.update({ components: [errPanel("Aucune configuration.")], flags: FLAGS_V2 });
      return;
    }
    await interaction.update({
      components: [
        panel(
          [
            textBlock(`## 👋 Configuration welcome\n${fieldRaw("Salon", `<#${cfg.channelId}>`)}\n${fieldRaw("Bienvenue", cfg.join ?? DEFAULT_JOIN)}\n${fieldRaw("Au revoir", cfg.leave ?? DEFAULT_LEAVE)}\n${fieldRaw("Panneau", cfg.embed === false ? "non" : "oui")}\n\n*Variables : {user} {server} {membercount}*`),
          ],
          BLUE
        ),
      ],
      flags: FLAGS_V2,
    });
    return;
  }

  if (action === "test") {
    const cfg = getWelcome(guild.id);
    if (!cfg?.channelId) {
      await interaction.update({ components: [errPanel("Aucune configuration.")], flags: FLAGS_V2 });
      return;
    }
    const channel = (await guild.channels.fetch(cfg.channelId).catch(() => null)) as TextBasedChannel | null;
    if (!channel?.isSendable()) {
      await interaction.update({ components: [errPanel("Le salon configuré est introuvable.")], flags: FLAGS_V2 });
      return;
    }
    const member = interaction.member as GuildMember | null;
    if (!member) {
      await interaction.update({ components: [errPanel("Impossible de récupérer ton profil.")], flags: FLAGS_V2 });
      return;
    }
    await sendWelcomeMessage(channel, renderWelcome(cfg.join ?? DEFAULT_JOIN, member), cfg.embed !== false);
    await interaction.update({ components: [okPanel("Message de test envoyé.")], flags: FLAGS_V2 });
    return;
  }

  if (action === "reset") {
    clearWelcome(guild.id);
    await interaction.update({ components: [okPanel("Configuration des messages supprimée.")], flags: FLAGS_V2 });
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId !== "welcome:modal:set") return;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const channelId = interaction.fields.getTextInputValue("salon").match(/\d{17,20}/)?.[0];
  const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel?.isTextBased()) {
    await interaction.reply({ components: [errPanel("Salon introuvable. Mentionne un salon textuel valide.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const cur = getWelcome(guild.id) ?? {};
  const bienvenueRaw = interaction.fields.getTextInputValue("bienvenue")?.trim();
  const aurevoirRaw = interaction.fields.getTextInputValue("aurevoir")?.trim();
  const panneauRaw = interaction.fields.getTextInputValue("panneau")?.trim().toLowerCase();
  const next: WelcomeConfig = {
    channelId: channel.id,
    join: bienvenueRaw || cur.join || DEFAULT_JOIN,
    leave: aurevoirRaw || cur.leave || DEFAULT_LEAVE,
    embed: panneauRaw ? panneauRaw !== "non" : (cur.embed ?? true),
  };
  setWelcome(guild.id, next);
  await interaction.reply({
    components: [
      okPanel(
        `## ✅ Messages configurés\n${fieldRaw("Salon", `<#${channel.id}>`)}\n${fieldRaw("Bienvenue", next.join ?? "")}\n${fieldRaw("Au revoir", next.leave ?? "")}\n${fieldRaw("Panneau", next.embed ? "oui" : "non")}`
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
