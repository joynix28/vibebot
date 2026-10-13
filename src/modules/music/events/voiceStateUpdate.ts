import { Events } from "discord.js";
import type { VoiceState } from "discord.js";
import { cleanupIfAlone } from "../func/player.ts";

// Quitte le salon vocal quand le bot s'y retrouve seul
// (ou quand il est déconnecté / le salon disparaît).

export const name = Events.VoiceStateUpdate;

export async function execute(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  cleanupIfAlone(guild);
}
