import { SlashCommandBuilder, ButtonStyle, PermissionFlagsBits } from "discord.js";
import type { ChatInputCommandInteraction, ButtonInteraction, MessageComponentInteraction, PartialGroupDMChannel, TextBasedChannel } from "discord.js";
import {
  FLAGS_V2_EPHEMERAL,
  panel,
  type PanelBlock,
  textBlock,
  sepBlock,
  mediaBlock,
  rowBlock,
  button,
  linkBtn,
  footnote,
} from "../func/ui.ts";
import {
  SETUP_URL,
  TV_ACCENT,
  mkCreator,
  setupGuild,
  sendIface,
} from "../func/voice.ts";

const EMOJI_SETUP = { id: "1128667742887755899", name: "Setup" };
const EMOJI_VOICE = { id: "585783907673440266", name: "voice" };
const EMOJI_CHANNEL = { id: "585783907841212418", name: "channel" };
const EMOJI_SETTINGS = { id: "585767366743293952", name: "settings" };

export const data = new SlashCommandBuilder()
  .setName("voice-setup")
  .setDescription("Setup the bot easily with an assistant within seconds")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const blocks: PanelBlock[] = [
    textBlock("Your first steps to get familiar with TempVoice..."),
    textBlock("# Setup TempVoice"),
  textBlock("Follow the introductions on:\nhttps://easy.tempvoice.xyz/getting-started/setup"),
  mediaBlock([{ url: SETUP_URL, description: "TempVoice setup" }]),
    textBlock(
      footnote(
        "Each Creator Channel has its own configuration, which you can manage on our [TempVoice Dashboard](https://tempvoice.xyz/dashboard). For detailed explanations on how everything works, please refer to our [TempVoice Documentation](https://easy.tempvoice.xyz)."
      )
    ),
    sepBlock(),
    rowBlock(
      button("voice-setup_bot_button", "Setup TempVoice", ButtonStyle.Danger, EMOJI_SETUP),
      button("voice-setup_creator_button", "New Creator", ButtonStyle.Secondary, EMOJI_VOICE),
      button("voice-setup_interface_button", "New Interface", ButtonStyle.Secondary, EMOJI_CHANNEL)
    ),
  ];
  await interaction.reply({ components: [panel(blocks, TV_ACCENT)], flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  if (!interaction.isButton()) return;
  const btn = interaction as ButtonInteraction;
  const guild = btn.guild;
  const member = btn.member;
  if (!guild) {
    await btn.reply({
      components: [panel([textBlock("## **Attention!**\nThis command must be used in a server.")], TV_ACCENT)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }
  const memberObj = member && "id" in member ? member : null;

  if (!memberObj || !("permissions" in memberObj) || !memberObj.permissions.has(PermissionFlagsBits.Administrator)) {
    await btn.reply({
      components: [panel([textBlock("## **Attention!**\nYou need the **Administrator** permission to use this.")], TV_ACCENT)],
      flags: FLAGS_V2_EPHEMERAL,
    });
    return;
  }

  switch (btn.customId) {
    case "voice-setup_creator_button": {
      const creatorId = await mkCreator(guild, memberObj);
      const blocks: PanelBlock[] = [
        textBlock(
        `## **Setup Complete!**\n<#${creatorId}> can now be used to create temporary voice channels in your Discord server.`
        ),
        sepBlock(),
        rowBlock(
          linkBtn(
            `https://tempvoice.xyz/dashboard/${guild.id}/${creatorId}`,
            "Configure Creator",
            EMOJI_SETTINGS
          )
        ),
      ];
      await btn.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
      break;
    }
    case "voice-setup_interface_button": {
      await sendIface(btn.channel as Exclude<TextBasedChannel, PartialGroupDMChannel>);
      const blocks: PanelBlock[] = [
        textBlock(
          "## **Setup Complete!**\nThis [interface](https://easy.tempvoice.xyz/premium/customize-interface) can now be used to manage temporary voice channels in your Discord server."
        ),
        sepBlock(),
      rowBlock(
          linkBtn(
            `https://tempvoice.xyz/dashboard/${guild.id}`,
            "Customise Interface",
            EMOJI_SETTINGS
          ),
          linkBtn(
            "https://easy.tempvoice.xyz/premium/customize-interface",
            "Custom Icon & Name",
            { id: "1287056994942849155", name: "Badge_Premium_Crown" }
          )
        ),
      ];
      await btn.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
      break;
    }
    case "voice-setup_bot_button": {
      const creatorId = await setupGuild(guild, memberObj);
      const blocks: PanelBlock[] = [
        textBlock(
          `## **Setup Complete!**\n<#${creatorId}> can now be used to create temporary voice channels in your Discord server.`
        ),
        sepBlock(),
        rowBlock(
          linkBtn("https://tempvoice.xyz/dashboard", "Configure TempVoice", EMOJI_SETTINGS)
        ),
      ];
      await btn.reply({ components: [panel(blocks)], flags: FLAGS_V2_EPHEMERAL });
      break;
    }
    default:
      await btn.reply({
        components: [panel([textBlock("## **Attention!**\nUnknown action.")])],
        flags: FLAGS_V2_EPHEMERAL,
      });
  }
}