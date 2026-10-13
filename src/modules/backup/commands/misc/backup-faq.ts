import { SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import { td, V2E } from "../../func/ui.ts";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How do I invite Xenon to my server?",
    a: "Please click [here](<https://xenon.bot/invite>) to invite Xenon to your server.\n\n*This didn't answer your question? Join our [support server](<https://xenon.bot/discord>).*",
  },
  {
    q: "Is Xenon safe to use?",
    a: "\n\n*This didn't answer your question? Join our [support server](<https://xenon.bot/discord>).*",
  },
  {
    q: "I received an error, what do I do?",
    a: "Please read the error carefully and try to understand it. If you can't make sense of the error please join our [support server](https://xenon.bot/discord) and ask in the support channel.\n\n*This didn't answer your question? Join our [support server](<https://xenon.bot/discord>).*",
  },
  {
    q: "How do I load or create a backup?",
    a: "You can create a backup of your server using the `/backup create` command. You can find a list of your previously created backup using the `/backup list` command. Use the `/backup load` command to load a backup on any server.\n\n*This didn't answer your question? Join our [support server](<https://xenon.bot/discord>).*",
  },
  {
    q: "How do I load or create a template?",
    a: "You can find a list of templates and instructions on how to load them at https://xenon.bot/templates . If you want to create your own template please follow the instructions [here](<https://wiki.xenon.bot/templates#creating-a-template>).\n\n*This didn't answer your question? Join our [support server](<https://xenon.bot/discord>).*",
  },
  {
    q: "Are there any premium features?",
    a: "No! This is a **completely free version of Xenon**, remade from the original bot which had premium features — here, **every feature is free**! Backups, messages, threads, bans, syncs, chatlogs, clipboard, whitelabel and more are all included.\n\n*This didn't answer your question? Join our [support server](<https://discord.gg/remaders>).*",
  },
];

export const data = new SlashCommandBuilder()
  .setName("backup-faq")
  .setDescription("You need help? Find the answer to your question here!")
  .addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true).setAutocomplete(true));

export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const q = interaction.options.getFocused().toLowerCase();
  const choices = FAQS.filter((f) => f.q.toLowerCase().includes(q)).slice(0, 25).map((f) => ({ name: f.q, value: f.q }));
  await interaction.respond(choices);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question")!;
  const faq = FAQS.find((f) => f.q.toLowerCase() === question.toLowerCase());

  const content = faq
    ? `**${faq.q}**\n\n${faq.a}`
    : `**${question}**\n\nWe couldn't find an answer to your question. Join our [support server](<https://xenon.bot/discord>) for help.`;

  await interaction.reply({ components: [td(content)], flags: V2E });
}
