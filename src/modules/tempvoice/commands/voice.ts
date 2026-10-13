import {
  SlashCommandBuilder,
  ChannelType,
  ActionRowBuilder,
  PermissionFlagsBits,
  ButtonStyle,
  ModalBuilder,
  LabelBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  GuildMember,
  VoiceChannel,
  TextChannel,
  TextBasedChannel,
  PartialGroupDMChannel,
} from "discord.js";
import { FLAGS_V2_EPHEMERAL, panel, type PanelBlock, textBlock, sepBlock, rowBlock, button, linkBtn, mediaBlock, footnote } from "../func/ui.ts";
import { isTemp, unregTemp, TV_ACCENT, SETUP_URL, mkCreator, setupGuild, sendIface } from "../func/voice.ts";
import {
  getState,
  saveState,
  rmState,
  saveSettings,
  regWaiting,
  unregWaiting,
} from "../func/voiceState.ts";
import { handleComponent as ifaceComponent, handleModal as ifaceModal } from "../func/interface.ts";

/** Hub /voice : interaction slash, menu ou modal déjà acquittée côté hub. */
type VInteraction = ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;

const REGION_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Automatic (Default)" },
  { value: "brazil", label: "Brazil" },
  { value: "hongkong", label: "Hong Kong" },
  { value: "india", label: "India" },
  { value: "japan", label: "Japan" },
  { value: "rotterdam", label: "Rotterdam" },
  { value: "singapore", label: "Singapore" },
  { value: "southafrica", label: "South Africa" },
  { value: "sydney", label: "Sydney" },
  { value: "us-central", label: "US Central" },
  { value: "us-east", label: "US East" },
  { value: "us-south", label: "US South" },
  { value: "us-west", label: "US West" },
];

const REGION_EMOJI = { id: "1161605689576263753", name: "region" };

const PRIVACY_OPTIONS = [
  { value: "locked", label: "Lock", desc: "Only trusted users will be able to join your voice channel", emoji: "1161605685201612840" },
  { value: "unlocked", label: "Unlock", desc: "Everyone will be able to join your voice channel", emoji: "1161605863111393352" },
  { value: "hidden", label: "Invisible", desc: "Only trusted users will be able to view your voice channel", emoji: "1161605867427348590" },
  { value: "unhidden", label: "Visible", desc: "Everyone will be able to view your voice channel", emoji: "1161605868522065922" },
  { value: "locked-chat", label: "Close Chat", desc: "Only trusted users will be able to text in your chat", emoji: "1161605462739918848" },
  { value: "unlocked-chat", label: "Open Chat", desc: "Everyone will be able to text in your chat", emoji: "1161605450828087346" },
];

const HUB_ACTIONS: { value: string; label: string; emoji: string; description: string }[] = [
  { value: "name", label: "Renommer", emoji: "📝", description: "Change the name of your temporary channel" },
  { value: "limit", label: "Limite", emoji: "👥", description: "Change the user limit of your channel" },
  { value: "bitrate", label: "Bitrate", emoji: "🎚️", description: "Change the bitrate (8–384 kbps)" },
  { value: "region", label: "Région", emoji: "🌍", description: "Change the voice region" },
  { value: "privacy", label: "Confidentialité", emoji: "🔒", description: "Lock, hide or manage chat access" },
  { value: "password", label: "Mot de passe", emoji: "🔑", description: "Set a password for your channel" },
  { value: "status", label: "Statut", emoji: "💬", description: "Change the channel status" },
  { value: "claim", label: "Revendiquer", emoji: "👑", description: "Claim ownership of the channel" },
  { value: "delete", label: "Supprimer", emoji: "🗑️", description: "Delete your temporary channel" },
  { value: "info", label: "Infos", emoji: "ℹ️", description: "Show channel information" },
  { value: "invite", label: "Invitation", emoji: "🔗", description: "Create an invite link" },
  { value: "reset", label: "Réinitialiser", emoji: "♻️", description: "Reset the channel configuration" },
  { value: "thread", label: "Fil", emoji: "🧵", description: "Create a temporary thread" },
  { value: "transfer", label: "Transférer", emoji: "🔄", description: "Transfer ownership to another user" },
  { value: "waiting", label: "Salle d'attente", emoji: "⏳", description: "Create a waiting room" },
  { value: "user:block", label: "Bloquer", emoji: "⛔", description: "Block users from your channel" },
  { value: "user:unblock", label: "Débloquer", emoji: "✅", description: "Unblock users" },
  { value: "user:trust", label: "Confiance", emoji: "🤝", description: "Trust users with permanent access" },
  { value: "user:untrust", label: "Retirer confiance", emoji: "🚫", description: "Remove trusted access" },
  { value: "user:kick", label: "Expulser", emoji: "👢", description: "Kick a user from the channel" },
  { value: "user:invite", label: "Inviter un membre", emoji: "✉️", description: "Invite a user to join" },
  { value: "join", label: "Rejoindre", emoji: "➡️", description: "Rejoindre un salon temporaire avec un mot de passe" },
  { value: "find", label: "Trouver un membre", emoji: "🔎", description: "Trouver dans quel salon vocal est un membre" },
  { value: "setup", label: "Configuration", emoji: "⚙️", description: "Configurer TempVoice sur ce serveur (admin)" },
];

function stringMenu(customId: string, placeholder: string, options: StringSelectMenuOptionBuilder[]) {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(1).setMaxValues(1).addOptions(options)
  );
}

function userMenu(customId: string, placeholder: string, min: number, max: number) {
  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
    new UserSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).setMinValues(min).setMaxValues(max)
  );
}

export const data = new SlashCommandBuilder()
  .setName("voice")
  .setDescription("🔊 Gère ton salon vocal temporaire");

function hubMessage(): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(TV_ACCENT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 🔊 Salon vocal temporaire\nChoisis une action ci-dessous 👇")
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("voice:menu")
          .setPlaceholder("Choisis une action…")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            HUB_ACTIONS.map((a) =>
              new StringSelectMenuOptionBuilder()
                .setLabel(a.label)
                .setValue(a.value)
                .setDescription(a.description)
                .setEmoji(a.emoji)
            )
          )
      )
    );
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  await interaction.reply({ components: [hubMessage()], flags: FLAGS_V2_EPHEMERAL });
}

/** Routage du menu principal du hub. Les customIds `voice_*` existants vont à l'interface. */
export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (interaction.isStringSelectMenu() && interaction.customId === "voice:menu") {
    await handleHubMenu(interaction);
    return;
  }
  // Sous-composants du hub (préfixe voice:) : recherche de membre et configuration.
  if (interaction.customId.startsWith("voice:")) {
    await handleHubSubComponent(interaction);
    return;
  }
  await ifaceComponent(interaction as any);
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (interaction.customId.startsWith("voice:modal:")) {
    await handleHubModal(interaction);
    return;
  }
  await ifaceModal(interaction);
}

async function handleHubMenu(interaction: MessageComponentInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  if (!interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];

  // Actions avec saisie requise -> modal dédié
  if (action === "name") return interaction.showModal(nameModal());
  if (action === "bitrate") return interaction.showModal(bitrateModal());
  if (action === "password") return interaction.showModal(passwordModal());
  if (action === "status") return interaction.showModal(statusModal());
  if (action === "join") return interaction.showModal(joinModal());

  // Trouver un membre -> sélecteur d'utilisateur natif
  if (action === "find") {
    await interaction.reply({
      components: [userMenu("voice:find:user", "Choisis le membre à localiser", 1, 1)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  // Configuration TempVoice (réservée aux administrateurs)
  if (action === "setup") {
    await showSetupPanel(interaction, member);
    return;
  }

  // Actions directes (sans options)
  switch (action) {
    case "limit": await limit(interaction, member); break;
    case "region": await region(interaction, member); break;
    case "privacy": await privacy(interaction, member); break;
    case "claim": await claim(interaction, member); break;
    case "delete": await deleteChannel(interaction, member); break;
    case "info": await info(interaction, member); break;
    case "invite": await invite(interaction, member); break;
    case "reset": await reset(interaction, member); break;
    case "thread": await thread(interaction, member); break;
    case "transfer": await transfer(interaction, member); break;
    case "waiting": await waiting(interaction, member); break;
    case "user:block":
    case "user:unblock":
    case "user:trust":
    case "user:untrust":
    case "user:kick":
    case "user:invite":
      await handleUserAction(interaction, member, action.slice(5));
      break;
    default:
      await attention(interaction, "Attention!", "Unknown action.");
  }
}

async function handleHubModal(interaction: ModalSubmitInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const action = interaction.customId.split(":")[2];

  if (action === "name") {
    const input = interaction.fields.getTextInputValue("name").trim();
    if (!input) {
      await attention(interaction, "Attention!", "Please provide a channel name.");
      return;
    }
    await applyRename(interaction, member, input);
    return;
  }
  if (action === "bitrate") {
    const raw = interaction.fields.getTextInputValue("bitrate").trim();
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 8 || value > 384) {
      await attention(interaction, "Attention!", "Bitrate must be a number between 8 and 384 kbps.");
      return;
    }
    const channel = needOwner(interaction, member);
    if (!channel) return;
    await channel.setBitrate(value * 1000);
    await success(interaction, "Updated!", `<#${channel.id}>'s bitrate is now **${value}kbps**.`);
    return;
  }
  if (action === "password") {
    const value = interaction.fields.getTextInputValue("password");
    const channel = needOwner(interaction, member);
    if (!channel) return;
    const st = getState(channel.id)!;
    st.password = value;
    saveState(channel.id);
    await success(interaction, "Updated!", `<#${channel.id}>'s password is now \`${value}\`.`);
    return;
  }
  if (action === "status") {
    const value = interaction.fields.getTextInputValue("status");
    const channel = needOwner(interaction, member);
    if (!channel) return;
    await channel.client.rest.patch(`/channels/${channel.id}`, { body: { status: value } }).catch(() => {});
    await success(interaction, "Updated!", `<#${channel.id}>'s status is now **${value}**.`);
    return;
  }
  if (action === "join") {
    const password = interaction.fields.getTextInputValue("password");
    await applyJoin(interaction, member, password);
    return;
  }
}

function nameModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voice:modal:name")
    .setTitle("Renommer le salon")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Nom du salon")
        .setDescription("Nouveau nom de ton salon vocal temporaire")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
    );
}

function bitrateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voice:modal:bitrate")
    .setTitle("Bitrate du salon")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Bitrate (kbps)")
        .setDescription("Valeur entre 8 et 384 kbps")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("bitrate")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(3)
            .setPlaceholder("64")
        )
    );
}

function passwordModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voice:modal:password")
    .setTitle("Mot de passe du salon")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Mot de passe")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("password")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
    );
}

function statusModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voice:modal:status")
    .setTitle("Statut du salon")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Statut")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("status")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
        )
    );
}

function joinModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("voice:modal:join")
    .setTitle("Rejoindre un salon")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Mot de passe")
        .setDescription("Le mot de passe du salon temporaire à rejoindre")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("password")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100)
        )
    );
}

/** Rejoint un salon temporaire via son mot de passe (ex-commande /join). */
async function applyJoin(interaction: VInteraction, member: GuildMember, password: string): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await attention(interaction, "Attention !", "Cette action doit être utilisée sur un serveur.");
    return;
  }
  const target = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildVoice && isTemp(c.id))
    .find((c) => getState(c.id)?.password === password);

  if (!target) {
    await attention(interaction, "Mot de passe incorrect !", "Aucun salon temporaire n'utilise ce mot de passe.");
    return;
  }
  if (!member.voice.channelId) {
    await attention(interaction, "Attention !", "Tu dois être dans un salon vocal pour le rejoindre.");
    return;
  }
  try {
    await member.voice.setChannel(target.id);
    await success(interaction, "Rejoint !", `Tu as rejoint <#${target.id}>.`);
  } catch {
    await attention(interaction, "Attention !", "Impossible de rejoindre ce salon temporaire.");
  }
}

/** Sous-composants du hub : recherche de membre et boutons de configuration. */
async function handleHubSubComponent(interaction: MessageComponentInteraction): Promise<void> {
  const member = interaction.member as GuildMember | null;
  if (!member) {
    await attention(interaction, "Attention!", "Unable to resolve your member.");
    return;
  }
  const cid = interaction.customId;

  if (interaction.isUserSelectMenu() && cid === "voice:find:user") {
    await handleFindUser(interaction, member);
    return;
  }
  if (interaction.isButton() && cid.startsWith("voice:setup:")) {
    await handleSetupButton(interaction, member);
    return;
  }
  await attention(interaction, "Attention!", "Unknown action.");
}

/** Localise le salon vocal temporaire d'un membre (ex-commande /voice-find). */
async function handleFindUser(interaction: MessageComponentInteraction, _member: GuildMember): Promise<void> {
  if (!interaction.isUserSelectMenu()) return;
  const guild = interaction.guild;
  const userId = interaction.values[0];
  if (!userId) {
    await attention(interaction, "Attention !", "Aucun membre sélectionné.");
    return;
  }
  const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
  const channel = member?.voice.channel;

  const blocks: PanelBlock[] = channel && isTemp(channel.id)
    ? [textBlock(`## **Trouvé !**\nLe membre <@${userId}> se trouve ici : <#${channel.id}>`)]
    : [
        textBlock(
          "## **Introuvable.**\nCe membre n'est pas dans un salon vocal temporaire public.\n- Il est peut-être dans un salon qui n'a pas été créé par TempVoice.\n- Le salon temporaire est peut-être invisible, ou tu n'as pas la permission de le voir."
        ),
      ];
  await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
}

const EMOJI_SETUP = { id: "1128667742887755899", name: "Setup" };
const EMOJI_VOICE = { id: "585783907673440266", name: "voice" };
const EMOJI_CHANNEL = { id: "585783907841212418", name: "channel" };
const EMOJI_SETTINGS = { id: "585767366743293952", name: "settings" };

/** Panneau de configuration TempVoice (ex-commande /voice-setup), réservé aux admins. */
async function showSetupPanel(interaction: MessageComponentInteraction, member: GuildMember): Promise<void> {
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await attention(interaction, "Attention !", "Tu as besoin de la permission **Administrateur** pour utiliser ceci.");
    return;
  }
  const blocks: PanelBlock[] = [
    textBlock("Tes premiers pas pour découvrir TempVoice..."),
    textBlock("# Configuration de TempVoice"),
    textBlock("Suis les instructions sur :\nhttps://easy.tempvoice.xyz/getting-started/setup"),
    mediaBlock([{ url: SETUP_URL, description: "Configuration TempVoice" }]),
    textBlock(
      footnote(
        "Chaque salon créateur a sa propre configuration, gérable depuis le [tableau de bord TempVoice](https://tempvoice.xyz/dashboard). Pour des explications détaillées, consulte la [documentation TempVoice](https://easy.tempvoice.xyz)."
      )
    ),
    sepBlock(),
    rowBlock(
      button("voice:setup:bot", "Configurer TempVoice", ButtonStyle.Danger, EMOJI_SETUP),
      button("voice:setup:creator", "Nouveau créateur", ButtonStyle.Secondary, EMOJI_VOICE),
      button("voice:setup:interface", "Nouvelle interface", ButtonStyle.Secondary, EMOJI_CHANNEL)
    ),
  ];
  await interaction.reply({ components: [panel(blocks, TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

async function handleSetupButton(interaction: MessageComponentInteraction, member: GuildMember): Promise<void> {
  if (!interaction.isButton()) return;
  const guild = interaction.guild;
  if (!guild) {
    await attention(interaction, "Attention !", "Cette action doit être utilisée sur un serveur.");
    return;
  }
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await attention(interaction, "Attention !", "Tu as besoin de la permission **Administrateur** pour utiliser ceci.");
    return;
  }
  const kind = interaction.customId.split(":")[2];

  if (kind === "creator") {
    const creatorId = await mkCreator(guild, member);
    const blocks: PanelBlock[] = [
      textBlock(`## **Configuration terminée !**\n<#${creatorId}> peut maintenant être utilisé pour créer des salons vocaux temporaires sur ton serveur.`),
      sepBlock(),
      rowBlock(linkBtn(`https://tempvoice.xyz/dashboard/${guild.id}/${creatorId}`, "Configurer le créateur", EMOJI_SETTINGS)),
    ];
    await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (kind === "interface") {
    await sendIface(interaction.channel as Exclude<TextBasedChannel, PartialGroupDMChannel>);
    const blocks: PanelBlock[] = [
      textBlock("## **Configuration terminée !**\nCette [interface](https://easy.tempvoice.xyz/premium/customize-interface) peut maintenant être utilisée pour gérer les salons vocaux temporaires de ton serveur."),
      sepBlock(),
      rowBlock(
        linkBtn(`https://tempvoice.xyz/dashboard/${guild.id}`, "Personnaliser l'interface", EMOJI_SETTINGS),
        linkBtn("https://easy.tempvoice.xyz/premium/customize-interface", "Icône et nom", { id: "1287056994942849155", name: "Badge_Premium_Crown" })
      ),
    ];
    await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  if (kind === "bot") {
    const creatorId = await setupGuild(guild, member);
    const blocks: PanelBlock[] = [
      textBlock(`## **Configuration terminée !**\n<#${creatorId}> peut maintenant être utilisé pour créer des salons vocaux temporaires sur ton serveur.`),
      sepBlock(),
      rowBlock(linkBtn("https://tempvoice.xyz/dashboard", "Configurer TempVoice", EMOJI_SETTINGS)),
    ];
    await interaction.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  await attention(interaction, "Attention !", "Action inconnue.");
}

function attention(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)], TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

function success(interaction: { reply: (o: object) => unknown }, title: string, body: string) {
  return interaction.reply({ components: [panel([textBlock(`## **${title}**\n${body}`)])], flags: FLAGS_V2_EPHEMERAL });
}

function ownedChannel(member: GuildMember): VoiceChannel | null {
  const ch = member.voice.channel;
  if (!ch || !isTemp(ch.id) || ch.type !== ChannelType.GuildVoice) return null;
  return ch as VoiceChannel;
}

function currentChannel(member: GuildMember): VoiceChannel | null {
  const ch = member.voice.channel;
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch as VoiceChannel;
}

function needOwner(interaction: { reply: (o: object) => unknown }, member: GuildMember): VoiceChannel | null {
  const ch = ownedChannel(member);
  if (!ch) {
    void attention(interaction, "Attention!", "You are not the owner of a temporary voice channel.");
    return null;
  }
  const st = getState(ch.id);
  if (!st || st.ownerId !== member.id) {
    void attention(interaction, "Attention!", "You are not the owner of this temporary voice channel.");
    return null;
  }
  return ch;
}

async function applyRename(interaction: VInteraction, member: GuildMember, input: string): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  const now = Date.now();
  if (now - st.lastRename < 5 * 60_000) {
    const next = Math.floor((st.lastRename + 5 * 60_000) / 1000);
    await attention(interaction, "Slow Down!", `This command can be used again **<t:${next}:R>**.\n### Why do I have to wait?\nThis command changes the name of your temporary channel, this is only possible [every 5 minutes](https://easy.tempvoice.xyz/faq/limits#discord-api).`);
    return;
  }
  await channel.setName(input);
  st.lastRename = now;
  saveState(channel.id);
  saveSettings(channel.guild.id, member.id, { name: input });
  await success(interaction, "Updated!", `<#${channel.id}>'s name is now **${input}**.`);
}

async function limit(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 50, 100].map((n) =>
    new StringSelectMenuOptionBuilder().setLabel(n === 0 ? "Unlimited" : `${n} users`).setValue(String(n)).setEmoji({ id: "1161605683955900496", name: "limit" })
  );
  await interaction.reply({ components: [stringMenu("voice_limit_menu", "Select the user limit", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function region(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = REGION_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value ?? "null").setEmoji(REGION_EMOJI));
  await interaction.reply({ components: [stringMenu("voice_region_menu", "Choose a channel region", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function privacy(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const opts = PRIVACY_OPTIONS.map((o) => new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value).setDescription(o.desc).setEmoji({ id: o.emoji, name: o.label }));
  await interaction.reply({ components: [stringMenu("voice_privacy_menu", "Select a Privacy Option", opts)], flags: FLAGS_V2_EPHEMERAL });
}

async function claim(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = currentChannel(member);
  if (!channel || !isTemp(channel.id)) {
    await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return;
  }
  const st = getState(channel.id)!;
  if (st.ownerId === member.id) {
    await attention(interaction, "Attention!", "You cannot claim your own temporary voice channel.");
    return;
  }
  if (channel.members.has(st.ownerId)) {
    await attention(interaction, "Attention!", `The owner, <@${st.ownerId}>, is still connected to this temporary voice channel.`);
    return;
  }
  st.ownerId = member.id;
  saveState(channel.id);
  await channel.permissionOverwrites.edit(st.ownerId, { ViewChannel: true, Connect: true });
  await success(interaction, "Claimed!", `You claimed **<#${channel.id}>**.`);
}

async function deleteChannel(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id);
  rmState(channel.id);
  unregTemp(channel.id);
  if (st?.waitingChannelId) {
    const w = channel.guild.channels.cache.get(st.waitingChannelId);
    if (w) await w.delete().catch(() => {});
    unregWaiting(st.waitingChannelId);
  }
  await channel.delete().catch(() => {});
  await success(interaction, "Closed!", `<#${channel.id}> has been deleted.`);
}

async function info(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = currentChannel(member);
  if (!channel || !isTemp(channel.id)) {
    await attention(interaction, "Attention!", "You are not in a temporary voice channel.");
    return;
  }
  const st = getState(channel.id);
  const blocks: PanelBlock[] = [
    textBlock(`# ${channel.name}`),
    sepBlock(),
    textBlock(`> **Owner:** <@${st?.ownerId ?? "?"}>`),
    textBlock(`> **User limit:** ${channel.userLimit === 0 ? "Unlimited" : channel.userLimit}`),
    textBlock(`> **Bitrate:** ${channel.bitrate / 1000}kbps`),
    textBlock(`> **Region:** ${channel.rtcRegion ?? "Automatic"}`),
    textBlock(`> **Locked:** ${st?.locked ? "Yes" : "No"}`),
    textBlock(`> **Hidden:** ${st?.hidden ? "Yes" : "No"}`),
    textBlock(`> **Members:** ${channel.members.size}`),
  ];
  await interaction.reply({ components: [panel(blocks, TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

async function invite(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
  if (!invite) {
    await attention(interaction, "Attention!", "Unable to create an invite for this channel.");
    return;
  }
  const link = `https://discord.gg/${invite.code}`;
  await success(interaction, "Invite!", `Join <#${channel.id}>: ${link}`);
}

async function reset(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  await channel.setName(`${member.displayName}'s Channel`);
  await channel.setUserLimit(0);
  await channel.setRTCRegion(null);
  await channel.setBitrate(64000);
  await channel.client.rest.patch(`/channels/${channel.id}`, { body: { status: null } }).catch(() => {});
  await channel.permissionOverwrites.edit(channel.guild.id, { ViewChannel: true, Connect: true });
  st.locked = false;
  st.hidden = false;
  st.chatLocked = false;
  st.password = null;
  st.lastRename = 0;
  saveState(channel.id);
  saveSettings(channel.guild.id, member.id, { name: `${member.displayName}'s Channel`, limit: 0, region: null });
  await success(interaction, "Reset!", `<#${channel.id}>'s configuration has been reset.`);
}

async function thread(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  const owner = await channel.guild.members.fetch(st.ownerId).catch(() => null);
  const interfaceChannel = channel.guild.channels.cache.find(
    (c) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) && c.name === "✨・interface"
  ) as TextChannel | undefined;
  if (!interfaceChannel) {
    await attention(interaction, "Attention!", "No interface channel was found for this server.");
    return;
  }
  const members = Array.from(channel.members.values());
  const t = await interfaceChannel.threads.create({
    name: owner?.displayName ?? "Voice Chat",
    autoArchiveDuration: 10080,
    type: ChannelType.PrivateThread,
    invitable: false,
  });
  for (const m of members) await t.members.add(m.id).catch(() => {});
  st.threadId = t.id;
  saveState(channel.id);
  await t.send({ content: `-# ${members.map((m) => `<@${m.id}>`).join(" ")} ${owner ? `<@${owner.id}>` : ""}`.trim() });
  await success(interaction, "Created!", "A temporary thread has been created for this channel.");
}

async function transfer(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  await interaction.reply({ components: [userMenu("voice_transfer_menu", "The selected user will gain the ownership", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
}

async function waiting(interaction: VInteraction, member: GuildMember): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  const st = getState(channel.id)!;
  if (st.hidden) {
    await attention(interaction, "Attention!", "You cannot create a waiting room when your channel is hidden.");
    return;
  }
  if (st.waiting && st.waitingChannelId) {
    await success(interaction, "Created!", "A waiting room is already available for this channel.");
    return;
  }
  const owner = await channel.guild.members.fetch(st.ownerId).catch(() => null);
  const waiting = await channel.guild.channels.create({
    name: `Ask ${owner?.displayName ?? "the owner"} to join`,
    type: ChannelType.GuildVoice,
    parent: channel.parentId,
    bitrate: 64000,
    permissionOverwrites: [
      { id: channel.guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect], deny: [PermissionFlagsBits.Speak, PermissionFlagsBits.SendMessages] },
      { id: channel.guild.client.user?.id as string, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.ManageChannels] },
    ],
  });
  st.waiting = true;
  st.waitingChannelId = waiting.id;
  saveState(channel.id);
  regWaiting(waiting.id, channel.id);
  await success(interaction, "Created!", "A waiting room has been created for this channel.");
}

async function handleUserAction(interaction: VInteraction, member: GuildMember, sub: string): Promise<void> {
  const channel = needOwner(interaction, member);
  if (!channel) return;
  switch (sub) {
    case "block":
      await interaction.reply({ components: [userMenu("voice_block_menu", "Selected users will be kicked and blocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "unblock":
      await interaction.reply({ components: [userMenu("voice_unblock_menu", "Selected users will be unblocked", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "trust":
      await interaction.reply({ components: [userMenu("voice_trust_menu", "Selected users will be trusted to join", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "untrust":
      await interaction.reply({ components: [userMenu("voice_untrust_menu", "Selected users will be untrusted", 1, 25)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "kick":
      await interaction.reply({ components: [userMenu("voice_kick_menu", "The selected user will be kicked", 1, 3)], flags: FLAGS_V2_EPHEMERAL });
      break;
    case "invite":
      await interaction.reply({ components: [userMenu("voice_invite_menu", "Selected user will be invited to join", 1, 1)], flags: FLAGS_V2_EPHEMERAL });
      break;
    default:
      await attention(interaction, "Attention!", "Unknown action.");
  }
}
