import {
  SlashCommandBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  Guild,
  VoiceBasedChannel,
} from "discord.js";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  StreamType,
} from "@discordjs/voice";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  panel,
  textBlock,
  okPanel,
  errPanel,
  actionRow,
  button,
  ACCENT,
  BLUE,
} from "../../../core/ui.ts";

export const data = new SlashCommandBuilder()
  .setName("soundboard")
  .setDescription("🔊 Joue des sons drôles dans ton salon vocal.");

const CMD = "soundboard";

interface Sound {
  id: string;
  label: string;
  emoji: string;
  url: string;
}

interface Category {
  id: string;
  label: string;
  emoji: string;
  description: string;
  sounds: Sound[];
}

// URLs myinstants (reprises du bot CorwinDev, fusionnées ici).
const CATEGORIES: Category[] = [
  {
    id: "memes",
    label: "Memes",
    emoji: "😂",
    description: "Les classiques du meme",
    sounds: [
      { id: "nani", label: "Nani ?!", emoji: "😲", url: "https://www.myinstants.com/media/sounds/nani.mp3" },
      { id: "fbi", label: "FBI Open Up", emoji: "🚨", url: "https://www.myinstants.com/media/sounds/fbi-open-up-sfx.mp3" },
      { id: "missionfailed", label: "Mission Failed", emoji: "💀", url: "https://www.myinstants.com/media/sounds/dank-meme-compilation-volume-17_cutted.mp3" },
      { id: "rimshot", label: "Rimshot", emoji: "🥁", url: "https://www.myinstants.com/media/sounds/rimshot.mp3" },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    emoji: "💬",
    description: "Sons du client Discord",
    sounds: [
      { id: "notification", label: "Notification", emoji: "🔔", url: "https://www.myinstants.com/media/sounds/discord-notification.mp3" },
      { id: "join", label: "Join vocal", emoji: "🟢", url: "https://www.myinstants.com/media/sounds/discord-sounds.mp3" },
      { id: "leave", label: "Leave vocal", emoji: "🔴", url: "https://www.myinstants.com/media/sounds/discord-leave_soGsPwn.mp3" },
      { id: "call", label: "Appel", emoji: "📞", url: "https://www.myinstants.com/media/sounds/discord-call-sound.mp3" },
    ],
  },
  {
    id: "fun",
    label: "Fun",
    emoji: "🎉",
    description: "Sons fun et musiques",
    sounds: [
      { id: "despacito", label: "Despacito", emoji: "🎶", url: "https://www.myinstants.com/media/sounds/despacito.mp3" },
      { id: "nyancat", label: "Nyan Cat", emoji: "🐱", url: "https://www.myinstants.com/media/sounds/nyan-cat.mp3" },
      { id: "rickroll", label: "Never Gonna…", emoji: "🎤", url: "https://www.myinstants.com/media/sounds/epic.swf_1.mp3" },
      { id: "roblox", label: "Oof Roblox", emoji: "🎮", url: "https://www.myinstants.com/media/sounds/roblox-death-sound-effect.mp3" },
    ],
  },
];

const ALL_SOUNDS = new Map<string, Sound>();
for (const c of CATEGORIES) for (const s of c.sounds) ALL_SOUNDS.set(s.id, s);

function hubContainer() {
  const container = panel(
    [textBlock("## 🔊 Soundboard\nChoisis une catégorie, puis clique sur un son : je le joue dans ton salon vocal 👇")],
    BLUE
  );
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:cat`)
    .setPlaceholder("Choisis une catégorie…")
    .addOptions(
      CATEGORIES.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.label)
          .setValue(c.id)
          .setDescription(c.description)
          .setEmoji(c.emoji)
      )
    );
  container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  return container;
}

function categoryContainer(cat: Category) {
  const container = panel(
    [textBlock(`## ${cat.emoji} ${cat.label}\n*Clique sur un son pour le jouer dans ton vocal.*`)],
    ACCENT
  );
  const buttons = cat.sounds.map((s) => button(`${CMD}:play:${s.id}`, s.label, ButtonStyle.Secondary, s.emoji));
  // 4 boutons par ligne
  for (let i = 0; i < buttons.length; i += 4) {
    container.addActionRowComponents(actionRow(...buttons.slice(i, i + 4)));
  }
  return container;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ components: [errPanel("Cette commande doit être utilisée sur un serveur.")], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await interaction.reply({ components: [hubContainer()], flags: FLAGS_V2_EPHEMERAL });
}

/** Joue un son dans le salon vocal du membre, puis quitte. */
async function playSound(guild: Guild, channel: VoiceBasedChannel, url: string): Promise<void> {
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  const player = createAudioPlayer();
  connection.subscribe(player);
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch {
    connection.destroy();
    throw new Error("connexion vocale");
  }
  const resource = createAudioResource(url, { inputType: StreamType.Arbitrary });
  player.play(resource);
  await new Promise<void>((resolve) => {
    const done = () => {
      connection.destroy();
      resolve();
    };
    player.once(AudioPlayerStatus.Idle, done);
    player.once("error", done);
    setTimeout(done, 60_000); // sécurité : ne jamais rester bloqué
  });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");

  if (parts[1] === "cat") {
    if (!interaction.isStringSelectMenu()) return;
    const cat = CATEGORIES.find((c) => c.id === interaction.values[0]);
    if (!cat) return;
    await interaction.update({ components: [categoryContainer(cat)] });
    return;
  }

  if (parts[1] === "play") {
    if (!interaction.isButton()) return;
    const sound = ALL_SOUNDS.get(parts[2] ?? "");
    if (!sound) {
      await interaction.reply({ components: [errPanel("Son introuvable.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const member = await guild.members.fetch(interaction.user.id).catch(() => null);
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ components: [errPanel("🔇 Rejoins d'abord un salon vocal !")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    const me = guild.members.me;
    if (me?.voice.channel && me.voice.channel.id !== voiceChannel.id) {
      await interaction.reply({ components: [errPanel("Je suis déjà dans un autre salon vocal.")], flags: FLAGS_V2_EPHEMERAL });
      return;
    }
    await interaction.deferUpdate();
    try {
      await playSound(guild, voiceChannel, sound.url);
      await interaction.followUp({
        components: [okPanel(`🔊 **${sound.emoji} ${sound.label}** joué dans ${voiceChannel} !`)],
        flags: FLAGS_V2_EPHEMERAL,
      });
    } catch {
      await interaction.followUp({
        components: [errPanel("Impossible de jouer le son (connexion vocale impossible depuis cet hébergeur).")],
        flags: FLAGS_V2_EPHEMERAL,
      });
    }
    return;
  }
}
