import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type {
  ChatInputCommandInteraction,
  Guild,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import {
  FLAGS_V2,
  FLAGS_V2_EPHEMERAL,
  msgPanel,
  okPanel,
  panel,
  textBlock,
} from "../../../core/ui.ts";
import { BLURPLE, needGuild, replyErr } from "./_shared.ts";

export const data = new SlashCommandBuilder()
  .setName("protect-utils")
  .setDescription("Utilitaires du serveur : badges, tag, boosts.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const CMD = "protect-utils";

const HUB_OPTIONS = [
  { label: "Badges Discord", value: "badges", emoji: "🏅", description: "Lister les membres avec des badges" },
  { label: "Rôle par tag", value: "tag", emoji: "🏷️", description: "Attribuer un rôle aux membres tagués" },
  { label: "Boosts", value: "boost", emoji: "💎", description: "Infos sur les boosts du serveur" },
];

function menuRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${CMD}:menu`)
    .setPlaceholder("Choisis une action…")
    .addOptions(
      HUB_OPTIONS.map((o) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(o.label)
          .setValue(o.value)
          .setDescription(o.description)
          .setEmoji(o.emoji)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function hubPayload(guild: Guild) {
  const body = panel(
    [textBlock(`# 🧰 Utilitaires\nOutils pratiques pour **${guild.name}**.`)],
    BLURPLE
  );
  return { components: [body, menuRow()], flags: FLAGS_V2_EPHEMERAL };
}

/** Extrait un ID depuis une mention ou un ID brut. */
function parseId(raw: string): string | null {
  const m = raw.trim().match(/^(?:<@!?(\d+)>|<@&(\d+)>|<#(\d+)>|(\d{15,20}))$/);
  return m?.[1] ?? m?.[2] ?? m?.[3] ?? m?.[4] ?? null;
}

function tagModal() {
  const modal = new ModalBuilder().setCustomId(`${CMD}:modal:tag`).setTitle("Rôle par tag");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("action")
        .setLabel("Action (ajouter / retirer)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setPlaceholder("ajouter")
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("role")
        .setLabel("Rôle (mention ou ID)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40)
        .setPlaceholder("@MonRôle ou 123456789")
    )
  );
  return modal;
}

const FLAG_LABELS: Record<string, string> = {
  Staff: "Employé Discord",
  Partner: "Partenaire Discord",
  Hypesquad: "HypeSquad Events",
  BugHunterLevel1: "Bug Hunter (niveau 1)",
  BugHunterLevel2: "Bug Hunter (niveau 2)",
  HypeSquadOnlineHouse1: "Bravery",
  HypeSquadOnlineHouse2: "Brilliance",
  HypeSquadOnlineHouse3: "Balance",
  PremiumEarlySupporter: "Early Supporter",
  VerifiedDeveloper: "Développeur vérifié",
  CertifiedModerator: "Modérateur certifié",
  ActiveDeveloper: "Développeur actif",
};

async function badgesCmd(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const byFlag = new Map<string, string[]>();
  for (const member of members.values()) {
    const flags = member.user.flags?.toArray() ?? [];
    for (const flag of flags) {
      const label = FLAG_LABELS[flag];
      if (!label) continue;
      const list = byFlag.get(label) ?? [];
      if (list.length < 15) list.push(`<@${member.id}>`);
      byFlag.set(label, list);
    }
  }
  if (!byFlag.size) {
    await interaction.editReply({
      components: [msgPanel("ℹ️ Aucun membre avec un badge Discord reconnu.", BLURPLE)],
      flags: FLAGS_V2,
    });
    return;
  }
  const lines = [...byFlag.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, ids]) => `🏅 **${label}** (${ids.length}) : ${ids.join(", ")}`);
  const content = `# 🏅 Badges Discord\n${lines.join("\n")}`.slice(0, 3900);
  await interaction.editReply({ components: [panel([textBlock(content)], BLURPLE)], flags: FLAGS_V2 });
}

async function tagCmd(
  guild: Guild,
  action: "add" | "remove",
  roleId: string,
  requestedBy: string,
  defer: () => Promise<unknown>,
  edit: (opts: { components: unknown[]; flags: number }) => Promise<unknown>,
  replyErrFn: (msg: string) => Promise<void>
): Promise<void> {
  const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    await replyErrFn("❌ Rôle introuvable.");
    return;
  }
  if (role.managed) {
    await replyErrFn(`❌ Le rôle ${role} est un rôle d'intégration, il ne peut pas être attribué.`);
    return;
  }
  const me = guild.members.me;
  if (!me || me.roles.highest.position <= role.position) {
    await replyErrFn(`❌ Je ne peux pas gérer le rôle ${role} (hiérarchie).`);
    return;
  }
  await defer();
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const tagged = members.filter((m) => m.user.primaryGuild?.identityGuildId === guild.id && !m.user.bot);
  let count = 0;
  for (const member of tagged.values()) {
    try {
      if (action === "add" && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, `Rôle tag demandé par @${requestedBy}`);
        count++;
      } else if (action === "remove" && member.roles.cache.has(role.id)) {
        await member.roles.remove(role, `Rôle tag demandé par @${requestedBy}`);
        count++;
      }
    } catch {
      // ignore les échecs individuels (hiérarchie, etc.)
    }
  }
  const verb = action === "add" ? "attribué" : "retiré";
  await edit({
    components: [okPanel(`✅ Rôle ${role} ${verb} à **${count}** membre${count > 1 ? "s" : ""} portant le tag du serveur.`)],
    flags: FLAGS_V2,
  });
}

async function boostCmd(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const boosters = guild.members.cache.filter((m) => m.premiumSince);
  const names = boosters.first(20).map((m) => `<@${m.id}>`);
  const content = [
    "# 💎 Boosts du serveur",
    `**Niveau :** ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boosts)`,
    `**Boosters :** ${boosters.size}`,
    names.length ? names.join(", ") : "*Aucun booster*",
  ].join("\n");
  await interaction.reply({ components: [panel([textBlock(content)], BLURPLE), menuRow()], flags: FLAGS_V2_EPHEMERAL });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = await needGuild(interaction);
  if (!guild) return;
  await interaction.reply({ ...hubPayload(guild), flags: FLAGS_V2_EPHEMERAL });
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD) return;
  if (parts[1] !== "menu" || !interaction.isStringSelectMenu()) return;
  const action = interaction.values[0];

  if (action === "badges") {
    await badgesCmd(interaction);
    return;
  }

  if (action === "boost") {
    await boostCmd(interaction);
    return;
  }

  if (action === "tag") {
    await interaction.showModal(tagModal());
    return;
  }
}

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const parts = interaction.customId.split(":");
  if (parts[0] !== CMD || parts[1] !== "modal" || parts[2] !== "tag") return;

  const rawAction = interaction.fields.getTextInputValue("action").trim().toLowerCase();
  const action = rawAction.startsWith("ret") ? "remove" : rawAction.startsWith("aj") || rawAction.startsWith("add") ? "add" : null;
  if (!action) {
    await replyErr(interaction, '❌ Action invalide : écris "ajouter" ou "retirer".');
    return;
  }
  const roleId = parseId(interaction.fields.getTextInputValue("role"));
  if (!roleId) {
    await replyErr(interaction, "❌ Rôle invalide : mentionne le rôle ou colle son ID.");
    return;
  }
  await tagCmd(
    guild,
    action,
    roleId,
    interaction.user.username,
    () => interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL }),
    (opts) => interaction.editReply(opts as never),
    (msg) => replyErr(interaction, msg)
  );
}
