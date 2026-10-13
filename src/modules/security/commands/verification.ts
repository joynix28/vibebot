import {
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { ChatInputCommandInteraction, MessageComponentInteraction } from "discord.js";
import { panel, textBlock, mediaBlock, button, actionRow, msgPanel, FLAGS_V2, FLAGS_V2_EPHEMERAL } from "../func/ui.ts";
import { ensureGuild, saveGuild } from "../func/db.ts";
import { genCode, renderCaptcha } from "../func/captcha.ts";

export const data = new SlashCommandBuilder()
  .setName("verification")
  .setDescription("Verification feature")
  .addSubcommand((s) => s.setName("enable").setDescription("Enable verification on your server"))
  .addSubcommand((s) =>
    s
      .setName("setup_role")
      .setDescription("Setup verification role on your server")
      .addRoleOption((o) => o.setName("role").setDescription("Role to use as unverified role, empty to create a new one").setRequired(false))
  )
  .addSubcommand((s) =>
    s
      .setName("setup_channel")
      .setDescription("Setup verification channel on your server")
      .addChannelOption((o) => o.setName("channel").setDescription("Channel to use as verification channel, empty to create a new one").setRequired(false))
  )
  .addSubcommand((s) => s.setName("disable").setDescription("Disable verification on your server without deleting unverified role and verification channel"))
  .addSubcommand((s) => s.setName("reset").setDescription("Reset verification on your server, deletes verification channel and unverified role"))
  .addSubcommand((s) =>
    s
      .setName("verify")
      .setDescription("Manually verify someone")
      .addUserOption((o) => o.setName("user").setDescription("User to verify").setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName("set_verified")
      .setDescription("Set a role to give your users when they get verified")
      .addRoleOption((o) => o.setName("role").setDescription("role to set, empty to reset").setRequired(false))
  )
  .addSubcommand((s) => s.setName("update_role").setDescription("Update unverified role permissions in the new text channels"))
  .addSubcommand((s) =>
    s
      .setName("type")
      .setDescription("Set the verification type.")
      .addIntegerOption((o) =>
        o
          .setName("type")
          .setDescription("Verification Type")
          .setRequired(true)
          .addChoices(
            { name: "Captcha Code", value: 1 },
            { name: "One-Click Verification", value: 2 }
          )
      )
  )
  .addSubcommandGroup((g) =>
    g
      .setName("captcha")
      .setDescription("Changes verification captcha color")
      .addSubcommand((s) =>
        s
          .setName("color")
          .setDescription("Changes verification captcha color")
          .addStringOption((o) => o.setName("color").setDescription("Hex color code, ex: #ffffff").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("length")
          .setDescription("Changes verification captcha code length")
          .addIntegerOption((o) =>
            o
              .setName("length")
              .setDescription("Code length")
              .setRequired(true)
              .addChoices(
                { name: "4", value: 4 },
                { name: "5", value: 5 },
                { name: "6", value: 6 },
                { name: "7", value: 7 },
                { name: "8", value: 8 }
              )
          )
      )
      .addSubcommand((s) =>
        s
          .setName("lines")
          .setDescription("Changes verification captcha code lines")
          .addIntegerOption((o) =>
            o
              .setName("lines")
              .setDescription("Captcha lines")
              .setRequired(true)
              .addChoices(
                { name: "0", value: 0 },
                { name: "1", value: 1 },
                { name: "2", value: 2 },
                { name: "3", value: 3 }
              )
          )
      )
      .addSubcommand((s) =>
        s
          .setName("sensitive")
          .setDescription("Toggle if captcha should be case sensitive or not")
          .addBooleanOption((o) => o.setName("sensitive").setDescription("Captcha case sensitive").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("numbers")
          .setDescription("Toggle if captcha should contain numbers or not")
          .addBooleanOption((o) => o.setName("numbers").setDescription("Captcha numbers").setRequired(true))
      )
      .addSubcommand((s) =>
        s
          .setName("timeout")
          .setDescription("Set captcha timeout so users will be asked to complete a new captcha")
          .addIntegerOption((o) =>
            o
              .setName("timeout")
              .setDescription("Captcha timeout")
              .setRequired(true)
              .addChoices(
                { name: "30 seconds", value: 30 },
                { name: "1 Minute", value: 60 },
                { name: "2 Minutes", value: 120 },
                { name: "5 Minutes", value: 300 }
              )
          )
      )
  );

const BLUE = 0x297fb9;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ components: [msgPanel("This command can only be used in a server.", BLUE)], flags: FLAGS_V2_EPHEMERAL });
    return;
  }

  const cfg = ensureGuild(guild.id);
  const sub = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup();

  const ephemeral = !(sub === "setup_role" || sub === "setup_channel" || group === "captcha");
  await interaction.deferReply({ flags: FLAGS_V2 | (ephemeral ? MessageFlags.Ephemeral : 0) });

  if (sub === "enable") {
    cfg.verify_enabled = 1;
    saveGuild(cfg);
    await eph(":green_circle: | Verification has been enabled.");
    return;
  }
  if (sub === "disable") {
    cfg.verify_enabled = 0;
    saveGuild(cfg);
    await eph(":red_circle: | Verification has been disabled.");
    return;
  }

  if (sub === "setup_role") {
    const logs: string[] = [];
    const chosen = interaction.options.getRole("role");
    let role = chosen ?? (cfg.verify_role ? guild.roles.cache.get(cfg.verify_role) : undefined);
    if (chosen) {
      logs.push("Unverified role has been set.");
    } else if (!role) {
      role = await guild.roles.create({
        name: "Unverified",
        permissions: [],
        reason: "Security - verification setup",
      });
      logs.push("Unverified role has been created.");
    } else {
      logs.push("Unverified role already exists.");
    }
    if (!role) {
      await nonEph(":red_circle: | Couldn't resolve a role.");
      return;
    }
    cfg.verify_role = role.id;
    saveGuild(cfg);
    logs.push("Setting up channel permissions...");

    let success = 0;
    let failures = 0;
    for (const ch of guild.channels.cache.values()) {
      if (!ch.isTextBased() || ch.isThread() || ch.id === cfg.verify_channel) continue;
      if (!(ch as any).permissionOverwrites) continue;
      try {
        await (ch as any).permissionOverwrites.create(role.id, { SendMessages: false });
        success++;
      } catch {
        failures++;
      }
    }
    logs.push(`Success: ${success}`, `Failures: ${failures}`, "Task has been finished.");

    const msg =
      `Unverified role has been setup, make sure to move it higher than your **(public roles, auto roles, and reaction roles)**\n\n` +
      `**Logs:**\n${logs.join("\n")}`;
    await nonEph(msg);
    return;
  }

  if (sub === "setup_channel") {
    const overwrites = [
      { id: guild.id, type: 0 as const, allow: 0n, deny: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages },
    ];
    if (cfg.verify_role) {
      overwrites.push({
        id: cfg.verify_role,
        type: 0 as const,
        allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory,
        deny: PermissionFlagsBits.SendMessages,
      });
    }

    const chosen = interaction.options.getChannel("channel");
    let ch: any = chosen;
    if (!ch) {
      ch = await guild.channels.create({
        name: "verification",
        type: ChannelType.GuildText,
        permissionOverwrites: overwrites,
        reason: "Security - verification setup",
      });
    } else {
      for (const ov of overwrites) {
        try {
          await ch.permissionOverwrites.create(ov.id, { ViewChannel: (ov.allow & PermissionFlagsBits.ViewChannel) ? true : null, SendMessages: false, ReadMessageHistory: (ov.allow & PermissionFlagsBits.ReadMessageHistory) ? true : null });
        } catch {}
      }
    }
    cfg.verify_channel = ch.id;
    saveGuild(cfg);

    const msg = panel(
      [
        textBlock(
          "This server requires you to verify yourself to get access to other channels, you can simply verify by completing a captcha, click on the button below."
        ),
        mediaBlock([{ url: "https://securitybot.gg/verify-banner.png" }]),
      ],
      BLUE
    );
    await ch
      .send({ components: [msg, actionRow(button("verification_verifyBtn", "Verify", ButtonStyle.Primary))], flags: FLAGS_V2 })
      .catch(() => {});

    await nonEph("Verification channel has been setup successfully.");
    return;
  }

  if (group === "captcha") {
    if (sub === "color") {
      const c = interaction.options.getString("color")!.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) {
        await nonEph(":red_circle: | Invalid hex color, use e.g. `#ffffff`.");
        return;
      }
      cfg.captcha_color = c;
      saveGuild(cfg);
      await nonEph(`Captcha color has been set to \`${c}\``);
      return;
    }
    if (sub === "length") {
      cfg.captcha_length = interaction.options.getInteger("length")!;
      saveGuild(cfg);
      await nonEph(`Captcha length has been set to **${cfg.captcha_length}**`);
      return;
    }
    if (sub === "lines") {
      cfg.captcha_lines = interaction.options.getInteger("lines")!;
      saveGuild(cfg);
      await nonEph(`Captcha lines has been set to **${cfg.captcha_lines}**`);
      return;
    }
    if (sub === "sensitive") {
      const v = interaction.options.getBoolean("sensitive")!;
      cfg.captcha_sensitive = v ? 1 : 0;
      saveGuild(cfg);
      await nonEph(`Captcha case sensitive has been set to **${v}**`);
      return;
    }
    if (sub === "numbers") {
      const v = interaction.options.getBoolean("numbers")!;
      cfg.captcha_numbers = v ? 1 : 0;
      saveGuild(cfg);
      await nonEph(`Captcha numbers has been set to **${v}**`);
      return;
    }
    if (sub === "timeout") {
      const t = interaction.options.getInteger("timeout")!;
      cfg.captcha_timeout = t;
      saveGuild(cfg);
      const label = t === 30 ? "30 seconds" : t === 60 ? "1 Minute" : t === 120 ? "2 Minutes" : "5 Minutes";
      await nonEph(`Captcha timeout has been set to **${label}**`);
      return;
    }
  }

  if (sub === "type") {
    const t = interaction.options.getInteger("type") ?? 1;
    cfg.verify_type = t === 2 ? "BUTTON" : "CAPTCHA";
    saveGuild(cfg);
    const label = t === 2 ? "One-Click Verification" : "Captcha Code";
    await nonEph(`Verification type has been set to **${label}**.`);
    return;
  }

  await eph(":red_circle: | This subcommand is not available yet.");

  async function eph(msg: string) {
    await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2_EPHEMERAL });
  }
  async function nonEph(msg: string) {
    await interaction.editReply({ components: [panel([textBlock(msg)], BLUE)], flags: FLAGS_V2 });
  }
}

const pending = new Map<string, { code: string; expires: number; entered: string; img?: string; buttons: number[] }>();

function shuffle(arr: number[]): number[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

export async function handleComponent(interaction: MessageComponentInteraction): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  if (interaction.customId === "verification_verifyBtn") {
    const cfg = ensureGuild(guild.id);
    if (!cfg.verify_enabled) {
      await interaction.reply({ content: "Verification is disabled.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (cfg.verify_type === "BUTTON") {
      const mgr = (interaction.member as any)?.roles;
      if (cfg.verify_role && mgr?.remove) await mgr.remove(cfg.verify_role).catch(() => {});
      await interaction.reply({ content: ":green_circle: | You have been verified successfully.", flags: MessageFlags.Ephemeral });
      return;
    }
    const code = genCode(cfg.captcha_length || 6);
    const img = await renderCaptcha(code);

    pending.set(interaction.user.id, {
      code,
      expires: Date.now() + (cfg.captcha_timeout || 120) * 1000,
      entered: "",
      buttons: shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    });

    await interaction.deferReply({ flags: FLAGS_V2_EPHEMERAL });
    await interaction.editReply({ files: [{ attachment: img, name: "captcha.png" }] });
    const m = await interaction.fetchReply();
    const p = pending.get(interaction.user.id)!;
    p.img = m.attachments.first()?.url;
    await interaction.editReply({ components: buildEntry(p), flags: FLAGS_V2_EPHEMERAL });
    return;
  }
  const p = pending.get(interaction.user.id);
  if (!p || Date.now() > p.expires) {
    pending.delete(interaction.user.id);
    const expired = msgPanel(
      ":red_circle: | Your captcha has expired.\n\nTo get a new one, click the **Verify** button below.",
      BLUE
    );
    await interaction
      .update({ components: [expired], flags: FLAGS_V2 })
      .catch(async () => {
        await interaction.reply({ content: ":red_circle: | Your captcha has expired, click Verify again.", flags: MessageFlags.Ephemeral }).catch(() => {});
      });
    return;
  }
  const codeLen = p.code.length;

  if (interaction.customId.startsWith("verification_digit_")) {
    const d = interaction.customId.slice("verification_digit_".length);
    if (p.entered.length < codeLen && /^\d$/.test(d)) {
      p.entered += d;
    }
    await interaction.update({ components: buildEntry(p), flags: FLAGS_V2 });
    return;
  }

  if (interaction.customId === "verification_back") {
    p.entered = p.entered.slice(0, -1);
    await interaction.update({ components: buildEntry(p), flags: FLAGS_V2 });
    return;
  }

  if (interaction.customId === "verification_submit") {
    const cfg = ensureGuild(guild.id);
    if (p.entered === p.code) {
      pending.delete(interaction.user.id);
      const mgr = (interaction.member as any)?.roles;
      if (cfg.verify_role && mgr?.remove) await mgr.remove(cfg.verify_role).catch(() => {});
      await interaction.update({
        components: [panel([textBlock(":green_circle: | You have been verified successfully.")], BLUE)],
        flags: FLAGS_V2,
      });
    } else {
      p.entered = "";
      await interaction.update({ components: buildEntry(p, ":red_circle: | Wrong code, try again."), flags: FLAGS_V2 });
    }
    return;
  }

  await interaction.reply({ content: "Unknown action.", flags: MessageFlags.Ephemeral });
}

function buildEntry(p: { entered: string; code: string; img?: string; buttons: number[] }, err?: string): any[] {
  const len = p.code.length;
  const slots: string[] = [];
  for (let i = 0; i < len; i++) slots.push(p.entered[i] ?? "_");
  const display = slots.map((s) => `\`${s}\``).join(" ");

  const blocks: any[] = [
    textBlock("Enter the code shown in the image to verify yourself:"),
    textBlock(`> Code: ${display}`),
  ];
  if (err) blocks.unshift(textBlock(err));
  if (p.img) blocks.push(mediaBlock([{ url: p.img }]));

  const digits = p.buttons.map((d) => button(`verification_digit_${d}`, String(d), ButtonStyle.Secondary));
  const row1 = actionRow(...digits.slice(0, 5));
  const row2 = actionRow(...digits.slice(5, 10));
  const row3 = actionRow(button("verification_back", "Delete", ButtonStyle.Danger), button("verification_submit", "Validate", ButtonStyle.Success));

  return [panel(blocks, BLUE), row1, row2, row3];
}
