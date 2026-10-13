import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
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
  GuildMember,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  TextChannel,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  GOLD,
  ACCENT,
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
  .setDescription("Organise des giveaways sur le serveur.");

function needManage(member: GuildMember | null): boolean {
  return member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false;
}

async function err(interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction, msg: string): Promise<void> {
  await interaction.reply({ components: [errPanel(msg)], flags: FLAGS_V2_EPHEMERAL });
}

function hubContainer() {
  const container = panel([textBlock("## 🎉 Giveaways\n*Choisis une action ci-dessous.*")], ACCENT);
  const menu = new StringSelectMenuBuilder()
    .setCustomId("giveaway:menu")
    .setPlaceholder("Choisis une action…")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("Créer un giveaway")
        .setValue("create")
        .setDescription("Lance un nouveau giveaway. (staff)")
        .setEmoji("🎉"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Lister les giveaways")
        .setValue("list")
        .setDescription("Affiche les giveaways du serveur.")
        .setEmoji("📋"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Terminer un giveaway")
        .setValue("end")
        .setDescription("Termine un giveaway et tire les gagnants. (staff)")
        .setEmoji("🏁"),
      new StringSelectMenuOptionBuilder()
        .setLabel("Retirer au sort")
        .setValue("reroll")
        .setDescription("Nouveau tirage d'un giveaway terminé. (staff)")
        .setEmoji("🎲")
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await err(interaction, "Cette commande ne peut être utilisée que sur un serveur.");
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  // Bouton "Participer" : customId `giveaway:join:<id>` (existant, conservé).
  if (interaction.customId.startsWith("giveaway:join:")) {
    await handleJoin(interaction);
    return;
  }
  if (!interaction.isStringSelectMenu() || interaction.customId !== "giveaway:menu") return;
  const guild = interaction.guild;
  if (!guild) {
    await err(interaction, "Cette commande ne peut être utilisée que sur un serveur.");
    return;
  }
  const action = interaction.values[0];

  if (action === "list") {
    await runList(interaction);
    return;
  }
  if (!needManage(interaction.member as GuildMember | null)) {
    await interaction.update({ components: [errPanel("Tu n'as pas la permission de gérer les giveaways (Gérer les messages requis).")], flags: FLAGS_V2 });
    return;
  }

  if (action === "create") {
    const modal = new ModalBuilder().setCustomId("giveaway:modal:create").setTitle("Créer un giveaway");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("Lot")
        .setDescription("Le lot à gagner.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("prix").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)
        ),
      new LabelBuilder()
        .setLabel("Durée")
        .setDescription("Ex : 30m, 2h, 7d (max 90 jours).")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("duree").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setPlaceholder("2h")
        ),
      new LabelBuilder()
        .setLabel("Gagnants (optionnel)")
        .setDescription("Nombre de gagnants, 1 à 20. Défaut : 1.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("gagnants").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setPlaceholder("1")
        ),
      new LabelBuilder()
        .setLabel("Salon (optionnel)")
        .setDescription("Mention ou ID du salon. Défaut : salon actuel.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("salon").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50)
        )
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "end" || action === "reroll") {
    const modal = new ModalBuilder()
      .setCustomId(`giveaway:modal:${action}`)
      .setTitle(action === "end" ? "Terminer un giveaway" : "Retirer au sort");
    modal.addLabelComponents(
      new LabelBuilder()
        .setLabel("ID du giveaway")
        .setDescription("L'ID affiché dans la liste des giveaways.")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("id").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
        )
    );
    await interaction.showModal(modal);
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await err(interaction, "Cette commande ne peut être utilisée que sur un serveur.");
    return;
  }
  if (!needManage(interaction.member as GuildMember | null)) {
    await err(interaction, "Tu n'as pas la permission de gérer les giveaways (Gérer les messages requis).");
    return;
  }

  if (interaction.customId === "giveaway:modal:create") {
    await runCreate(interaction);
    return;
  }
  if (interaction.customId === "giveaway:modal:end") {
    const id = Number(interaction.fields.getTextInputValue("id"));
    if (!Number.isInteger(id) || id < 1) {
      await err(interaction, "ID invalide.");
      return;
    }
    await runEnd(interaction, id);
    return;
  }
  if (interaction.customId === "giveaway:modal:reroll") {
    const id = Number(interaction.fields.getTextInputValue("id"));
    if (!Number.isInteger(id) || id < 1) {
      await err(interaction, "ID invalide.");
      return;
    }
    await runReroll(interaction, id);
    return;
  }
}

async function runCreate(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild!;
  const prize = interaction.fields.getTextInputValue("prix").trim();
  const rawDur = interaction.fields.getTextInputValue("duree").trim();
  const gagnantsRaw = interaction.fields.getTextInputValue("gagnants")?.trim();
  const salonRaw = interaction.fields.getTextInputValue("salon")?.trim();
  const winners = gagnantsRaw ? Number(gagnantsRaw) : 1;
  if (!Number.isInteger(winners) || winners < 1 || winners > 20) {
    await err(interaction, "Nombre de gagnants invalide (1 à 20).");
    return;
  }

  const dur = parseDuration(rawDur);
  if (!dur) {
    await err(interaction, "Durée invalide. Utilise un format comme `30m`, `2h` ou `7d`.");
    return;
  }
  if (dur.ms > 90 * 86_400_000) {
    await err(interaction, "La durée maximale d'un giveaway est de 90 jours.");
    return;
  }

  let target: TextChannel | null = null;
  const salonId = salonRaw ? salonRaw.match(/\d{17,20}/)?.[0] : null;
  if (salonId) {
    const ch = await guild.channels.fetch(salonId).catch(() => null);
    if (ch?.type === ChannelType.GuildText) target = ch as TextChannel;
    if (!target) {
      await err(interaction, "Salon introuvable. Mentionne un salon textuel valide.");
      return;
    }
  } else {
    const ch = interaction.channel;
    if (ch?.type === ChannelType.GuildText) target = ch as TextChannel;
  }
  if (!target) {
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

async function runList(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild!;
  const items = listGiveaways(guild.id);
  if (items.length === 0) {
    await interaction.update({
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
  await interaction.update({
    components: [panel([textBlock(`# 🎉 Giveaways\n${lines.join("\n\n")}`)], GOLD)],
    flags: FLAGS_V2,
  });
}

async function runEnd(interaction: ModalSubmitInteraction, id: number): Promise<void> {
  const guild = interaction.guild!;
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

async function runReroll(interaction: ModalSubmitInteraction, id: number): Promise<void> {
  const guild = interaction.guild!;
  const gw = getGiveaway(id);
  if (!gw || gw.guild_id !== guild.id) {
    await err(interaction, `Giveaway **#${id}** introuvable sur ce serveur.`);
    return;
  }
  if (!gw.ended) {
    await err(interaction, "Le giveaway n'est pas encore terminé.");
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

/** Bouton "Participer" : customId `giveaway:join:<id>` (logique d'origine conservée). */
async function handleJoin(interaction: MessageComponentInteraction): Promise<void> {
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
