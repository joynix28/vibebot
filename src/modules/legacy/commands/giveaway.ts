import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type {
  ChatInputCommandInteraction,
  GuildMember,
  MessageComponentInteraction,
  TextChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  GOLD,
  errPanel,
  okPanel,
  panel,
  textBlock,
} from "../func/ui.ts";
import {
  createGiveaway,
  entryCount,
  getEntries,
  getGiveaway,
  hasEntry,
  addEntry,
  listGiveaways,
  setGiveawayMessage,
  type Giveaway,
} from "../func/db.ts";
import { parseDuration, drawWinners } from "../func/dur.ts";
import { finishGiveaway, giveawayComponents } from "../func/giveaway.ts";

/** Fenêtre de reroll après la fin d'un giveaway (reprise du legacy). */
const REROLL_WINDOW_MS = 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Organise des giveaways sur le serveur.")
  .addSubcommand((s) =>
    s
      .setName("create")
      .setDescription("Lance un nouveau giveaway.")
      .addStringOption((o) =>
        o.setName("prix").setDescription("Le lot à gagner.").setRequired(true).setMaxLength(200)
      )
      .addStringOption((o) =>
        o.setName("duree").setDescription("Durée du giveaway (ex : 30m, 2h, 7d).").setRequired(true).setMaxLength(10)
      )
      .addIntegerOption((o) =>
        o.setName("gagnants").setDescription("Nombre de gagnants.").setMinValue(1).setMaxValue(20)
      )
      .addChannelOption((o) =>
        o
          .setName("salon")
          .setDescription("Salon où publier le giveaway (défaut : salon actuel).")
          .addChannelTypes(ChannelType.GuildText)
      )
  )
  .addSubcommand((s) => s.setName("list").setDescription("Affiche la liste des giveaways."))
  .addSubcommand((s) =>
    s
      .setName("end")
      .setDescription("Termine un giveaway immédiatement et tire les gagnants.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du giveaway.").setRequired(true).setMinValue(1))
  )
  .addSubcommand((s) =>
    s
      .setName("reroll")
      .setDescription("Retire au sort les gagnants d'un giveaway terminé.")
      .addIntegerOption((o) => o.setName("id").setDescription("ID du giveaway.").setRequired(true).setMinValue(1))
  );

function needManage(member: GuildMember | null): boolean {
  return member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false;
}

async function err(interaction: ChatInputCommandInteraction, msg: string): Promise<void> {
  await interaction.reply({ components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await err(interaction, "Cette commande ne peut être utilisée que sur un serveur.");
    return;
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "list") {
    await runList(interaction);
    return;
  }
  if (!needManage(interaction.member as GuildMember | null)) {
    await err(interaction, "Tu n'as pas la permission de gérer les giveaways (Gérer les messages requis).");
    return;
  }
  switch (sub) {
    case "create":
      await runCreate(interaction);
      break;
    case "end":
      await runEnd(interaction);
      break;
    case "reroll":
      await runReroll(interaction);
      break;
    default:
      await err(interaction, "Sous-commande inconnue.");
  }
}

async function runCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const prize = interaction.options.getString("prix", true).trim();
  const rawDur = interaction.options.getString("duree", true);
  const winners = interaction.options.getInteger("gagnants") ?? 1;

  const dur = parseDuration(rawDur);
  if (!dur) {
    await err(interaction, "Durée invalide. Utilise un format comme `30m`, `2h` ou `7d`.");
    return;
  }
  if (dur.ms > 90 * 86_400_000) {
    await err(interaction, "La durée maximale d'un giveaway est de 90 jours.");
    return;
  }

  const target = (interaction.options.getChannel("salon") ?? interaction.channel) as TextChannel | null;
  if (!target || target.type !== ChannelType.GuildText) {
    await err(interaction, "Le salon cible doit être un salon textuel.");
    return;
  }

  const gw = createGiveaway({
    guildId: guild.id,
    channelId: target.id,
    prize,
    winnersCount: winners,
    endsAt: Date.now() + dur.ms,
    createdBy: interaction.user.id,
  });

  const msg = await target.send({ components: giveawayComponents(gw) }).catch(() => null);
  if (!msg) {
    await err(interaction, "Impossible de publier le giveaway dans ce salon (permissions ?).");
    return;
  }
  setGiveawayMessage(gw.id, msg.id);

  const ends = Math.floor(gw.ends_at / 1000);
  await interaction.reply({
    components: [
      okPanel(
        `🎉 Giveaway **#${gw.id}** lancé dans <#${target.id}> !\n` +
          `> **Lot :** ${prize}\n` +
          `> **Durée :** ${dur.label} (fin <t:${ends}:R>)\n` +
          `> **Gagnants :** ${winners}`
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function runList(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const items = listGiveaways(guild.id);
  if (items.length === 0) {
    await interaction.reply({
      components: [panel([textBlock("# 🎉 Giveaways\n> *Aucun giveaway sur ce serveur.*")], GOLD)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = items.slice(0, 10).map((g: Giveaway) => {
    const count = entryCount(g.id);
    const status = g.ended ? "✅ Terminé" : `⏳ Fin <t:${Math.floor(g.ends_at / 1000)}:R>`;
    return `**#${g.id}** — ${g.prize}\n> ${status} • ${g.winners_count} gagnant(s) • \`${count}\` participant(s)`;
  });
  await interaction.reply({
    components: [panel([textBlock(`# 🎉 Giveaways\n${lines.join("\n\n")}`)], GOLD)],
    flags: FLAGS_V2,
  });
}

async function runEnd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const id = interaction.options.getInteger("id", true);
  const gw = getGiveaway(id);
  if (!gw || gw.guild_id !== guild.id) {
    await err(interaction, `Giveaway **#${id}** introuvable sur ce serveur.`);
    return;
  }
  if (gw.ended) {
    await err(interaction, `Le giveaway **#${id}** est déjà terminé.`);
    return;
  }
  const winners = await finishGiveaway(interaction.client, gw);
  await interaction.reply({
    components: [
      okPanel(
        `Giveaway **#${id}** terminé ! 🎉\n` +
          (winners.length
            ? `> **Gagnant(s) :** ${winners.map((w) => `<@${w}>`).join(", ")}`
            : "> *Aucun participant.*")
      ),
    ],
    flags: FLAGS_V2_EPHEMERAL,
  });
}

async function runReroll(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild!;
  const id = interaction.options.getInteger("id", true);
  const gw = getGiveaway(id);
  if (!gw || gw.guild_id !== guild.id) {
    await err(interaction, `Giveaway **#${id}** introuvable sur ce serveur.`);
    return;
  }
  if (!gw.ended) {
    await err(interaction, "Le giveaway n'est pas encore terminé. Utilise `/giveaway end` d'abord.");
    return;
  }
  const endedAt = gw.ended_at ?? gw.ends_at;
  if (Date.now() - endedAt > REROLL_WINDOW_MS) {
    await err(interaction, "Le reroll n'est possible que dans l'heure qui suit la fin du giveaway.");
    return;
  }
  const winners = drawWinners(getEntries(gw.id), Math.max(1, gw.winners_count));
  if (winners.length === 0) {
    await err(interaction, "Aucun participant à retirer au sort.");
    return;
  }
  await interaction.reply({
    components: [
      panel(
        [
          textBlock(
            `# 🎲 Nouveau tirage — Giveaway #${id}\n**Lot :** ${gw.prize}\n**Nouveau(x) gagnant(s) :** ${winners
              .map((w) => `<@${w}>`)
              .join(", ")}\nFélicitations ! 🎊`
          ),
        ],
        GOLD
      ),
    ],
    flags: FLAGS_V2,
  });
}

/** Bouton "Participer" : customId `giveaway:join:<id>`. */
export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const m = interaction.customId.match(/^giveaway:join:(\d+)$/);
  if (!m) return;
  const gw = getGiveaway(Number(m[1]));
  if (!gw || (interaction.guildId && gw.guild_id !== interaction.guildId)) {
    await interaction.reply({ components: [errPanel("Ce giveaway n'existe plus.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (gw.ended) {
    await interaction.reply({ components: [errPanel("Ce giveaway est déjà terminé.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (interaction.user.bot) return;

  if (hasEntry(gw.id, interaction.user.id)) {
    await interaction.reply({ components: [errPanel("Tu participes déjà à ce giveaway ! 🍀")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  addEntry(gw.id, interaction.user.id);

  // Rafraîchit le compteur de participants sur le message d'origine.
  const fresh: Giveaway = { ...gw };
  try {
    await interaction.update({ components: giveawayComponents(fresh) });
  } catch {
    await interaction.reply({
      components: [okPanel("✅ Participation enregistrée ! Bonne chance 🍀")],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  await interaction.followUp({
    components: [okPanel("✅ Participation enregistrée ! Bonne chance 🍀")],
    flags: FLAGS_V2_EPHEMERAL,
  });
}
