import {
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { FLAGS_V2, FLAGS_V2_EPHEMERAL, okPanel, errPanel, msgPanel, BLUE } from "../../../core/ui.ts";
import { ensureQueue, canControl, getQueue } from "../func/player.ts";
import {
  createPlaylist,
  getPlaylist,
  listPlaylists,
  deletePlaylist,
  playlistExists,
  sanitizePlaylistName,
} from "../func/db.ts";
import type { PlaylistTrack } from "../func/db.ts";

/** Fonction de réponse unifiée. */
type Respond = (components: ContainerBuilder[], flags?: number) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Définition de la commande (hub sans sous-commandes)
// ---------------------------------------------------------------------------

const MENU_OPTIONS: { value: string; label: string; emoji: string; description: string; modal: boolean }[] = [
  { value: "charger", label: "Charger", emoji: "📥", description: "Charge une playlist dans la file", modal: true },
  { value: "sauvegarder", label: "Sauvegarder", emoji: "💾", description: "Sauvegarde la file actuelle", modal: true },
  { value: "liste", label: "Liste", emoji: "📃", description: "Voir les playlists du serveur", modal: false },
  { value: "supprimer", label: "Supprimer", emoji: "🗑️", description: "Supprime une playlist", modal: true },
];

const DJ_ONLY = new Set(["sauvegarder", "supprimer"]);

export function playlistHubMenu(): ContainerBuilder {
  const select = new StringSelectMenuBuilder()
    .setCustomId("musique:plmenu")
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
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("musique:back").setLabel("Retour").setStyle(ButtonStyle.Secondary).setEmoji("◀️")
  );
  return new ContainerBuilder()
    .setAccentColor(BLUE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📃 Playlists\nChoisis une action dans le menu ci-dessous 👇")
    )
    .addActionRowComponents(row)
    .addActionRowComponents(backRow as unknown as ActionRowBuilder<StringSelectMenuBuilder>);
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function modalFor(action: string): ModalBuilder | null {
  const base = (title: string) => new ModalBuilder().setCustomId(`musique:modal:pl-${action}`).setTitle(title);
  const nameField = new LabelBuilder()
    .setLabel("Nom de la playlist")
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId("nom")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder("Ex : soirée")
    );
  switch (action) {
    case "charger":
      return base("📥 Charger une playlist").addLabelComponents(nameField);
    case "sauvegarder":
      return base("💾 Sauvegarder la file").addLabelComponents(nameField);
    case "supprimer":
      return base("🗑️ Supprimer une playlist").addLabelComponents(nameField);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// handleComponent
// ---------------------------------------------------------------------------

export async function handlePlaylistComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.guild) return;
  if (interaction.customId !== "musique:plmenu" || !interaction.isStringSelectMenu()) return;

  const action = interaction.values[0] ?? "";

  if (action === "liste") {
    await interaction.deferUpdate();
    await doListe(interaction.guild.id, (components, flags = FLAGS_V2_EPHEMERAL) =>
      interaction.followUp({ components, flags })
    );
    return;
  }

  // DJ requis pour sauvegarder / supprimer (vérifié avant d'ouvrir le modal).
  if (DJ_ONLY.has(action) && !canControl(interaction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut faire ça.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const modal = modalFor(action);
  if (modal) await (interaction as StringSelectMenuInteraction).showModal(modal);
}

// ---------------------------------------------------------------------------
// handleModal
// ---------------------------------------------------------------------------

export async function handlePlaylistModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const guildId = guild.id;
  const parts = interaction.customId.split(":"); // musique:modal:pl-<action>
  if (parts[1] !== "modal") return;
  const action = (parts[2] ?? "").replace(/^pl-/, "");

  // Défense en profondeur : re-vérifie le rôle DJ (déjà contrôlé avant le modal).
  if (DJ_ONLY.has(action) && !canControl(interaction as unknown as MessageComponentInteraction)) {
    await interaction.reply({ components: [errPanel("Seul un DJ peut faire ça.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const send: Respond = (components, flags = FLAGS_V2_EPHEMERAL) =>
    interaction.reply({ components, flags });
  const field = (name: string): string => {
    try {
      return interaction.fields.getTextInputValue(name);
    } catch {
      return "";
    }
  };
  const name = sanitizePlaylistName(field("nom"));

  if (action === "charger") {
    if (!name) {
      await send([errPanel("Indique le nom de la playlist.")]);
      return;
    }
    const pl = getPlaylist(guildId, name);
    if (!pl || pl.tracks.length === 0) {
      await send([errPanel(`Playlist **${name}** introuvable ou vide.`)]);
      return;
    }
    await interaction.deferReply({ flags: FLAGS_V2 });
    const joined = await ensureQueue(interaction as unknown as MessageComponentInteraction);
    if ("error" in joined) {
      await interaction.editReply({ components: [errPanel(joined.error)] });
      return;
    }
    const songs = pl.tracks.map((t: PlaylistTrack) => ({
      title: t.title,
      url: t.url,
      duration: t.duration,
      requestedBy: interaction.user.id,
    }));
    await joined.queue.addSongs(songs);
    await interaction.editReply({
      components: [okPanel(`📃 Playlist **${pl.name}** chargée : ${songs.length} morceaux ajoutés à la file.`)],
    });
    return;
  }

  if (action === "sauvegarder") {
    if (!name) {
      await send([errPanel("Indique un nom pour la playlist.")]);
      return;
    }
    const queue = getQueue(guildId);
    const tracks: PlaylistTrack[] = [];
    const np = queue?.nowPlaying();
    if (np) tracks.push({ title: np.song.title, url: np.song.url, duration: np.song.duration });
    for (const s of queue?.upcoming ?? []) tracks.push({ title: s.title, url: s.url, duration: s.duration });
    if (tracks.length === 0) {
      await send([errPanel("La file d'attente est vide, rien à sauvegarder.")]);
      return;
    }
    if (playlistExists(guildId, name)) {
      await send([errPanel(`Une playlist nommée **${name}** existe déjà. Supprime-la d'abord via le menu « Supprimer ».`)]);
      return;
    }
    createPlaylist(guildId, name, tracks, interaction.user.id);
    await send([okPanel(`💾 Playlist **${name}** sauvegardée (${tracks.length} morceaux).`)], FLAGS_V2);
    return;
  }

  if (action === "supprimer") {
    if (!name) {
      await send([errPanel("Indique le nom de la playlist.")]);
      return;
    }
    const deleted = deletePlaylist(guildId, name);
    await send([deleted ? okPanel(`🗑️ Playlist **${name}** supprimée.`) : errPanel(`Playlist **${name}** introuvable.`)]);
    return;
  }
}

// ---------------------------------------------------------------------------
// Logique métier
// ---------------------------------------------------------------------------

async function doListe(guildId: string, send: Respond): Promise<void> {
  const lists = listPlaylists(guildId);
  if (lists.length === 0) {
    await send(
      [msgPanel("📃 Aucune playlist sauvegardée.\nUtilise le menu « Sauvegarder » pour en créer une.", BLUE)],
      FLAGS_V2
    );
    return;
  }
  const lines = lists
    .map((p) => `🎵 **${p.name}** — ${p.tracks.length} morceau${p.tracks.length > 1 ? "x" : ""} (par <@${p.created_by}>)`)
    .join("\n");
  await send([msgPanel(`## 📃 Playlists du serveur\n\n${lines}`, BLUE)], FLAGS_V2);
}
