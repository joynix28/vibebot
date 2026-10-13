import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  GuildMember,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  BLUE,
  errPanel,
  okPanel,
  msgPanel,
  actionRow,
  button,
} from "../../../core/ui.ts";
import { MAX_QUERY_LENGTH, type LoopMode } from "../func/player.ts";
import type { SettingsPatch } from "../func/db.ts";
import type { HubInteraction } from "./_hub.ts";
import { runPlay } from "./play.ts";
import { runSearch, handleSearchPick } from "./search.ts";
import { runQueue, handleQueuePage } from "./queue.ts";
import { runNowPlaying, handleNowPlayingControls } from "./nowplaying.ts";
import { runPause } from "./pause.ts";
import { runResume } from "./resume.ts";
import { runSkip } from "./skip.ts";
import { runSkipTo } from "./skipto.ts";
import { runStop } from "./stop.ts";
import { runShuffle } from "./shuffle.ts";
import { runMove } from "./move.ts";
import { runLoop } from "./loop.ts";
import { runRemove } from "./remove.ts";
import { runVolume } from "./volume.ts";
import { runLyrics } from "./lyrics.ts";
import { runMusicSetup, configPanel } from "./music-setup.ts";
import { playlistHubMenu, handlePlaylistComponent, handlePlaylistModal } from "./playlist.ts";

// ---------------------------------------------------------------------------
// /musique — hub unique du module musique (17 actions)
// ---------------------------------------------------------------------------

export const data = new SlashCommandBuilder()
  .setName("musique")
  .setDescription("🎵 Panneau musique : lecture, file d'attente, contrôles.");

const MENU_OPTIONS: { value: string; label: string; emoji: string; description: string }[] = [
  { value: "jouer", label: "Jouer", emoji: "▶️", description: "Joue un morceau ou l'ajoute à la file" },
  { value: "rechercher", label: "Rechercher", emoji: "🔎", description: "Cherche et choisis parmi 5 résultats" },
  { value: "file", label: "File d'attente", emoji: "📋", description: "Affiche la file d'attente" },
  { value: "encours", label: "En cours", emoji: "🎶", description: "Morceau actuel et contrôles" },
  { value: "pause", label: "Pause", emoji: "⏸️", description: "Met en pause (DJ)" },
  { value: "reprendre", label: "Reprendre", emoji: "▶️", description: "Reprend la lecture (DJ)" },
  { value: "passer", label: "Passer", emoji: "⏭️", description: "Morceau suivant (vote si non-DJ)" },
  { value: "aller", label: "Aller à", emoji: "🔢", description: "Saute à une position (DJ)" },
  { value: "stop", label: "Stop", emoji: "⏹️", description: "Arrête tout et quitte (DJ)" },
  { value: "melanger", label: "Mélanger", emoji: "🔀", description: "Mélange la file (DJ)" },
  { value: "deplacer", label: "Déplacer", emoji: "↔️", description: "Déplace un morceau (DJ)" },
  { value: "repeter", label: "Répéter", emoji: "🔁", description: "Mode de répétition (DJ)" },
  { value: "retirer", label: "Retirer", emoji: "➖", description: "Retire un morceau (DJ)" },
  { value: "volume", label: "Volume", emoji: "🔊", description: "Affiche ou règle le volume" },
  { value: "paroles", label: "Paroles", emoji: "📝", description: "Paroles du morceau en cours" },
  { value: "playlists", label: "Playlists", emoji: "📚", description: "Gère les playlists du serveur" },
  { value: "config", label: "Configuration", emoji: "⚙️", description: "Règle DJ, salons, votes…" },
];

export function musiqueHubMenu(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("musique:menu")
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
    .setAccentColor(BLUE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🎵 Musique\nChoisis une action dans le menu ci-dessous 👇")
    )
    .addActionRowComponents(row);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [musiqueHubMenu()], flags: FLAGS_V2_EPHEMERAL });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function textField(customId: string, label: string, opts: { required?: boolean; maxLength?: number; placeholder?: string; description?: string } = {}) {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(TextInputStyle.Short)
    .setRequired(opts.required ?? false);
  if (opts.maxLength) input.setMaxLength(opts.maxLength);
  if (opts.placeholder) input.setPlaceholder(opts.placeholder);
  const lb = new LabelBuilder().setLabel(label).setTextInputComponent(input);
  if (opts.description) lb.setDescription(opts.description);
  return lb;
}

function modalFor(action: string): ModalBuilder | null {
  const base = (title: string) => new ModalBuilder().setCustomId(`musique:modal:${action}`).setTitle(title);
  switch (action) {
    case "jouer":
      return base("▶️ Jouer un morceau").addLabelComponents(
        textField("requete", "Recherche", { required: true, maxLength: MAX_QUERY_LENGTH, placeholder: "Titre, ou lien YouTube / SoundCloud", description: "Titre à rechercher, ou lien YouTube / SoundCloud." })
      );
    case "rechercher":
      return base("🔎 Rechercher").addLabelComponents(
        textField("requete", "Recherche", { required: true, maxLength: 200, placeholder: "Artiste - Titre" })
      );
    case "aller":
      return base("🔢 Aller à une position").addLabelComponents(
        textField("position", "Position", { required: true, maxLength: 4, placeholder: "Ex : 3", description: "Numéro du morceau dans la file." })
      );
    case "deplacer":
      return base("↔️ Déplacer un morceau").addLabelComponents(
        textField("de", "Position actuelle", { required: true, maxLength: 4, placeholder: "Ex : 5" }),
        textField("vers", "Nouvelle position", { required: true, maxLength: 4, placeholder: "Ex : 2" })
      );
    case "retirer":
      return base("➖ Retirer un morceau").addLabelComponents(
        textField("position", "Position", { required: true, maxLength: 4, placeholder: "Ex : 3", description: "Numéro du morceau dans la file." })
      );
    case "volume":
      return base("🔊 Volume").addLabelComponents(
        textField("niveau", "Niveau (0-100)", { maxLength: 3, placeholder: "Vide = afficher le volume actuel" })
      );
    case "paroles":
      return base("📝 Paroles").addLabelComponents(
        textField("morceau", "Morceau (optionnel)", { maxLength: 200, placeholder: "Vide = morceau en cours", description: "« Artiste - Titre ». Vide = morceau en cours." })
      );
    default:
      return null;
  }
}

function cfgRolesModal(): ModalBuilder {
  const m = new ModalBuilder().setCustomId("musique:modal:cfg-roles").setTitle("🎭 Rôle & salons");
  m.addLabelComponents(
    new LabelBuilder()
      .setLabel("Rôle DJ")
      .setDescription("Laisse vide pour ne pas changer.")
      .setRoleSelectMenuComponent(new RoleSelectMenuBuilder().setCustomId("role_dj").setMinValues(0).setMaxValues(1)),
    new LabelBuilder()
      .setLabel("Salon texte")
      .setDescription("Laisse vide pour ne pas changer.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder().setCustomId("salon_texte").setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1)
      ),
    new LabelBuilder()
      .setLabel("Salon vocal")
      .setDescription("Laisse vide pour ne pas changer.")
      .setChannelSelectMenuComponent(
        new ChannelSelectMenuBuilder().setCustomId("salon_vocal").setChannelTypes(ChannelType.GuildVoice).setMinValues(0).setMaxValues(1)
      )
  );
  return m;
}

function cfgNombresModal(): ModalBuilder {
  const m = new ModalBuilder().setCustomId("musique:modal:cfg-nombres").setTitle("🔢 Volumes & votes");
  m.addLabelComponents(
    textField("volume_defaut", "Volume par défaut (0-100)", { maxLength: 3, placeholder: "Vide = inchangé" }),
    textField("pourcentage_skip", "% d'auditeurs pour passer (10-100)", { maxLength: 3, placeholder: "Vide = inchangé" }),
    textField("delai_inactivite", "Délai d'inactivité en secondes (0-600)", { maxLength: 3, placeholder: "Vide = inchangé" })
  );
  return m;
}

function loopModeSelect(): { panel: ReturnType<typeof msgPanel>; row: ActionRowBuilder<StringSelectMenuBuilder> } {
  const select = new StringSelectMenuBuilder()
    .setCustomId("musique:loopmode")
    .setPlaceholder("Choisis un mode…")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Désactivée").setValue("off").setEmoji("➡️").setDescription("Pas de répétition"),
      new StringSelectMenuOptionBuilder().setLabel("Répéter le morceau").setValue("track").setEmoji("🔂").setDescription("Le morceau actuel en boucle"),
      new StringSelectMenuOptionBuilder().setLabel("Répéter la file").setValue("queue").setEmoji("🔁").setDescription("Toute la file en boucle")
    );
  return {
    panel: msgPanel("## 🔁 Mode de répétition\nChoisis un mode ci-dessous 👇", BLUE),
    row: new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
  };
}

// ---------------------------------------------------------------------------
// handleComponent
// ---------------------------------------------------------------------------

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const cid = interaction.customId;

  // Sous-composants existants (re-préfixés en musique:)
  if (cid.startsWith("musique:searchpick:")) { await handleSearchPick(interaction); return; }
  if (cid.startsWith("musique:queuepage:")) { await handleQueuePage(interaction); return; }
  if (cid === "musique:nppause" || cid === "musique:npskip" || cid === "musique:npstop" || cid === "musique:nploop") {
    await handleNowPlayingControls(interaction); return;
  }
  if (cid === "musique:plmenu") { await handlePlaylistComponent(interaction); return; }
  if (cid === "musique:back") {
    await interaction.update({ components: [musiqueHubMenu()], flags: FLAGS_V2 });
    return;
  }
  if (cid === "musique:loopmode") {
    if (!interaction.isStringSelectMenu()) return;
    const mode = (interaction.values[0] ?? "off") as LoopMode;
    await runLoop(interaction as HubInteraction, mode);
    return;
  }
  if (cid === "musique:cfgbtn:roles" || cid === "musique:cfgbtn:nombres") {
    const member = interaction.member as GuildMember | null;
    if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ components: [errPanel("⛔ Cette commande nécessite la permission **Gérer le serveur**.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.showModal(cid.endsWith(":roles") ? cfgRolesModal() : cfgNombresModal());
    return;
  }

  if (cid !== "musique:menu" || !interaction.isStringSelectMenu()) return;
  const menu = interaction as StringSelectMenuInteraction;
  const action = menu.values[0] ?? "";

  switch (action) {
    case "jouer":
    case "rechercher":
    case "aller":
    case "deplacer":
    case "retirer":
    case "volume":
    case "paroles": {
      const modal = modalFor(action);
      if (modal) await menu.showModal(modal);
      return;
    }
    case "file": await runQueue(menu as HubInteraction); return;
    case "encours": await runNowPlaying(menu as HubInteraction); return;
    case "pause": await runPause(menu as HubInteraction); return;
    case "reprendre": await runResume(menu as HubInteraction); return;
    case "passer": await runSkip(menu as HubInteraction); return;
    case "stop": await runStop(menu as HubInteraction); return;
    case "melanger": await runShuffle(menu as HubInteraction); return;
    case "repeter": {
      const { panel, row } = loopModeSelect();
      await menu.reply({ components: [panel, row], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    case "playlists":
      await menu.update({ components: [playlistHubMenu()], flags: FLAGS_V2 });
      return;
    case "config": {
      const member = menu.member as GuildMember | null;
      if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await menu.reply({ components: [errPanel("⛔ Cette action nécessite la permission **Gérer le serveur**.")], flags: FLAGS_V2_EPHEMERAL });
        return;
      }
      await menu.reply({
        components: [
          configPanel(guild.id, "⚙️ Configuration musique", BLUE),
          actionRow(
            button("musique:cfgbtn:roles", "Rôle & salons", ButtonStyle.Secondary, "🎭"),
            button("musique:cfgbtn:nombres", "Volumes & votes", ButtonStyle.Secondary, "🔢")
          ),
        ],
        flags: FLAGS_V2_EPHEMERAL,
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// handleModal
// ---------------------------------------------------------------------------

function fieldOf(interaction: ModalSubmitInteraction, name: string): string {
  try {
    return interaction.fields.getTextInputValue(name)?.trim() ?? "";
  } catch {
    return "";
  }
}

function parsePos(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":"); // musique:modal:<action>
  if (parts[0] !== "musique" || parts[1] !== "modal") return;
  const action = parts[2] ?? "";
  const ix = interaction as HubInteraction;

  // Playlists (délégué)
  if (action.startsWith("pl-")) { await handlePlaylistModal(interaction); return; }

  switch (action) {
    case "jouer": {
      const q = fieldOf(interaction, "requete");
      if (!q) { await interaction.reply({ components: [errPanel("Indique une recherche.")], flags: FLAGS_V2_EPHEMERAL }); return; }
      await runPlay(ix, q.slice(0, MAX_QUERY_LENGTH));
      return;
    }
    case "rechercher": {
      const q = fieldOf(interaction, "requete");
      if (!q) { await interaction.reply({ components: [errPanel("Indique une recherche.")], flags: FLAGS_V2_EPHEMERAL }); return; }
      await runSearch(ix, q.slice(0, 200));
      return;
    }
    case "aller": {
      const pos = parsePos(fieldOf(interaction, "position"));
      if (pos === null) { await interaction.reply({ components: [errPanel("Position invalide (nombre ≥ 1).")], flags: FLAGS_V2_EPHEMERAL }); return; }
      await runSkipTo(ix, pos);
      return;
    }
    case "deplacer": {
      const from = parsePos(fieldOf(interaction, "de"));
      const to = parsePos(fieldOf(interaction, "vers"));
      if (from === null || to === null) { await interaction.reply({ components: [errPanel("Positions invalides (nombres ≥ 1).")], flags: FLAGS_V2_EPHEMERAL }); return; }
      await runMove(ix, from, to);
      return;
    }
    case "retirer": {
      const pos = parsePos(fieldOf(interaction, "position"));
      if (pos === null) { await interaction.reply({ components: [errPanel("Position invalide (nombre ≥ 1).")], flags: FLAGS_V2_EPHEMERAL }); return; }
      await runRemove(ix, pos);
      return;
    }
    case "volume": {
      const raw = fieldOf(interaction, "niveau");
      if (!raw) { await runVolume(ix, null); return; }
      const n = Number.parseInt(raw, 10);
      if (!Number.isInteger(n) || n < 0 || n > 100) {
        await interaction.reply({ components: [errPanel("Niveau invalide (0 à 100).")], flags: FLAGS_V2_EPHEMERAL });
        return;
      }
      await runVolume(ix, n);
      return;
    }
    case "paroles": {
      const morceau = fieldOf(interaction, "morceau");
      await runLyrics(ix, morceau || null);
      return;
    }
    case "cfg-roles": {
      const patch: SettingsPatch = {};
      const roleId = interaction.fields.getSelectedRoles("role_dj")?.firstKey();
      if (roleId) patch.dj_role = roleId;
      const textId = interaction.fields.getSelectedChannels("salon_texte")?.firstKey();
      if (textId) patch.text_channel = textId;
      const voiceId = interaction.fields.getSelectedChannels("salon_vocal")?.firstKey();
      if (voiceId) patch.voice_channel = voiceId;
      await runMusicSetup(ix, Object.keys(patch).length > 0 ? patch : null);
      return;
    }
    case "cfg-nombres": {
      const patch: SettingsPatch = {};
      const bad: string[] = [];
      const volRaw = fieldOf(interaction, "volume_defaut");
      if (volRaw) {
        const n = Number.parseInt(volRaw, 10);
        if (!Number.isInteger(n) || n < 0 || n > 100) bad.push("volume (0-100)");
        else patch.default_volume = n;
      }
      const skipRaw = fieldOf(interaction, "pourcentage_skip");
      if (skipRaw) {
        const n = Number.parseInt(skipRaw, 10);
        if (!Number.isInteger(n) || n < 10 || n > 100) bad.push("votes skip (10-100)");
        else patch.skip_percent = n;
      }
      const stayRaw = fieldOf(interaction, "delai_inactivite");
      if (stayRaw) {
        const n = Number.parseInt(stayRaw, 10);
        if (!Number.isInteger(n) || n < 0 || n > 600) bad.push("délai (0-600)");
        else patch.stay_time = n;
      }
      if (bad.length > 0) {
        await interaction.reply({ components: [errPanel(`Valeurs invalides : ${bad.join(", ")}.`)], flags: FLAGS_V2_EPHEMERAL });
        return;
      }
      await runMusicSetup(ix, Object.keys(patch).length > 0 ? patch : null);
      return;
    }
  }
}
