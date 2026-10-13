import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, GuildMember, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  msgPanel,
  okPanel,
  errPanel,
  panel,
  textBlock,
  sepBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { getWelcome, setWelcome, clearWelcome } from "../func/db-gestion.ts";
import type { WelcomeConfig } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("welcome")
  .setDescription("Configure les messages de bienvenue et d'au revoir.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("set")
      .setDescription("Définit le salon et les messages de bienvenue / au revoir.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Salon où envoyer les messages.").addChannelTypes(ChannelType.GuildText).setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("bienvenue").setDescription("Message de bienvenue. Variables : {user} {server} {membercount}.")
      )
      .addStringOption((o) =>
        o.setName("aurevoir").setDescription("Message d'au revoir. Variables : {user} {server} {membercount}.")
      )
      .addBooleanOption((o) => o.setName("embed").setDescription("Envoyer dans un panneau (défaut : oui)."))
  )
  .addSubcommand((s) => s.setName("show").setDescription("Affiche la configuration actuelle."))
  .addSubcommand((s) => s.setName("test").setDescription("Envoie un message de test dans le salon configuré."))
  .addSubcommand((s) => s.setName("reset").setDescription("Supprime la configuration."));

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

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "set") {
    const channel = interaction.options.getChannel("salon", true);
    const cur = getWelcome(guild.id) ?? {};
    const next: WelcomeConfig = {
      channelId: channel.id,
      join: interaction.options.getString("bienvenue") ?? cur.join ?? DEFAULT_JOIN,
      leave: interaction.options.getString("aurevoir") ?? cur.leave ?? DEFAULT_LEAVE,
      embed: interaction.options.getBoolean("embed") ?? cur.embed ?? true,
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
    return;
  }

  if (sub === "show") {
    const cfg = getWelcome(guild.id);
    if (!cfg?.channelId) {
      await interaction.reply({ components: [errPanel("Aucune configuration. Utilise `/welcome set` pour en créer une.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.reply({
      components: [
        panel(
          [
            textBlock(`## 👋 Configuration welcome\n${fieldRaw("Salon", `<#${cfg.channelId}>`)}\n${fieldRaw("Bienvenue", cfg.join ?? DEFAULT_JOIN)}\n${fieldRaw("Au revoir", cfg.leave ?? DEFAULT_LEAVE)}\n${fieldRaw("Panneau", cfg.embed === false ? "non" : "oui")}\n\n*Variables : {user} {server} {membercount}*`),
          ],
          BLUE
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "test") {
    const cfg = getWelcome(guild.id);
    if (!cfg?.channelId) {
      await interaction.reply({ components: [errPanel("Aucune configuration. Utilise `/welcome set` d'abord.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const channel = (await guild.channels.fetch(cfg.channelId).catch(() => null)) as TextBasedChannel | null;
    if (!channel?.isSendable()) {
      await interaction.reply({ components: [errPanel("Le salon configuré est introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const member = interaction.member as GuildMember | null;
    if (!member) {
      await interaction.reply({ components: [errPanel("Impossible de récupérer ton profil.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await sendWelcomeMessage(channel, renderWelcome(cfg.join ?? DEFAULT_JOIN, member), cfg.embed !== false);
    await interaction.reply({ components: [okPanel("Message de test envoyé.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  // reset
  clearWelcome(guild.id);
  await interaction.reply({ components: [okPanel("Configuration des messages supprimée.")], flags: FLAGS_V2_EPHEMERAL });
}
