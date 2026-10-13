import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  BLUE,
  okPanel,
  errPanel,
  panel,
  textBlock,
  fieldRaw,
} from "../../../core/ui.ts";
import { addCounter, removeCounter, listCounters, allCounters } from "../func/db-gestion.ts";

export const data = new SlashCommandBuilder()
  .setName("counter")
  .setDescription("Affiche des compteurs (membres, bots…) dans le nom de salons vocaux.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((s) =>
    s
      .setName("add")
      .setDescription("Ajoute un compteur sur un salon vocal.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon vocal à renommer.").addChannelTypes(ChannelType.GuildVoice).setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Ce que le compteur affiche.")
          .setRequired(true)
          .addChoices(
            { name: "Membres", value: "membres" },
            { name: "Humains", value: "humains" },
            { name: "Bots", value: "bots" },
            { name: "En ligne", value: "en-ligne" },
            { name: "Salons", value: "salons" },
            { name: "Boosts", value: "boosts" }
          )
      )
      .addStringOption((o) =>
        o.setName("modele").setDescription("Modèle du nom, {count} = le nombre. Ex : « 👥 Membres : {count} ».")
      )
  )
  .addSubcommand((s) =>
    s
      .setName("remove")
      .setDescription("Retire un compteur d'un salon vocal.")
      .addChannelOption((o) =>
        o.setName("salon").setDescription("Le salon vocal concerné.").addChannelTypes(ChannelType.GuildVoice).setRequired(true)
      )
  )
  .addSubcommand((s) => s.setName("list").setDescription("Liste les compteurs du serveur."));

export const COUNTER_KINDS: Record<string, string> = {
  membres: "Membres",
  humains: "Humains",
  bots: "Bots",
  "en-ligne": "En ligne",
  salons: "Salons",
  boosts: "Boosts",
};

export const DEFAULT_TEMPLATES: Record<string, string> = {
  membres: "👥 Membres : {count}",
  humains: "🧍 Humains : {count}",
  bots: "🤖 Bots : {count}",
  "en-ligne": "🟢 En ligne : {count}",
  salons: "📁 Salons : {count}",
  boosts: "🚀 Boosts : {count}",
};

export function applyCounterTemplate(template: string, count: number): string {
  return template.replaceAll("{count}", String(count)).slice(0, 100);
}

/** Calcule la valeur d'un compteur pour un serveur (best effort depuis le cache). */
export async function computeCounterValue(guild: Guild, kind: string): Promise<number> {
  switch (kind) {
    case "membres":
      return guild.memberCount;
    case "salons":
      return guild.channels.cache.size;
    case "boosts":
      return guild.premiumSubscriptionCount ?? 0;
    case "humains":
    case "bots": {
      let members = guild.members.cache;
      if (members.size === 0) {
        try {
          members = await guild.members.fetch();
        } catch {
          return 0;
        }
      }
      const humans = members.filter((m) => !m.user.bot).size;
      return kind === "humains" ? humans : members.size - humans;
    }
    case "en-ligne":
      return guild.members.cache.filter((m) => m.presence?.status && m.presence.status !== "offline").size;
    default:
      return 0;
  }
}

/** Rafraîchit le nom d'un salon compteur si besoin. */
export async function refreshCounter(guild: Guild, channelId: string, kind: string, template: string): Promise<void> {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return;
  const value = await computeCounterValue(guild, kind);
  const name = applyCounterTemplate(template, value);
  if (channel.name !== name) {
    await channel.setName(name, "Mise à jour du compteur").catch(() => {});
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const sub = interaction.options.getSubcommand();

  if (sub === "add") {
    const channel = interaction.options.getChannel("salon", true);
    const kind = interaction.options.getString("type", true);
    const template = interaction.options.getString("modele") ?? DEFAULT_TEMPLATES[kind] ?? "{count}";
    addCounter(guild.id, channel.id, kind, template);
    await refreshCounter(guild, channel.id, kind, template);
    const preview = applyCounterTemplate(template, await computeCounterValue(guild, kind));
    await interaction.reply({
      components: [
        okPanel(
          `## ✅ Compteur ajouté\n${fieldRaw("Salon", `<#${channel.id}>`)}\n${fieldRaw("Type", COUNTER_KINDS[kind] ?? kind)}\n${fieldRaw("Modèle", template)}\n${fieldRaw("Aperçu", preview)}\n\n*Mis à jour automatiquement toutes les 10 minutes.*`
        ),
      ],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  if (sub === "remove") {
    const channel = interaction.options.getChannel("salon", true);
    const removed = removeCounter(guild.id, channel.id);
    await interaction.reply({
      components: [removed ? okPanel(`Compteur retiré de <#${channel.id}>.`) : errPanel(`Aucun compteur sur <#${channel.id}>.`)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  // list
  const counters = listCounters(guild.id);
  if (counters.length === 0) {
    await interaction.reply({ components: [errPanel("Aucun compteur configuré. Utilise `/counter add`.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const lines = counters
    .map((c, i) => `\`${i + 1}.\` <#${c.channel_id}> — **${COUNTER_KINDS[c.kind] ?? c.kind}** — \`${c.template}\``)
    .join("\n");
  await interaction.reply({ components: [panel([textBlock(`## 📊 Compteurs\n${lines}`)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
}

/** Utilisé par le scheduler : rafraîchit tous les compteurs de tous les serveurs. */
export async function refreshAllCounters(client: { guilds: Guild["client"]["guilds"] }): Promise<void> {
  for (const c of allCounters()) {
    const guild = await client.guilds.fetch(c.guild_id).catch(() => null);
    if (!guild) continue;
    try {
      await refreshCounter(guild, c.channel_id, c.kind, c.template);
    } catch {
      /* salon supprimé ou permissions manquantes */
    }
  }
}
