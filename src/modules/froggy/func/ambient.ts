import type { Client } from "discord.js";
import { ensure } from "./db.ts";
import { em } from "./emoji.ts";
import { flag_v2 } from "./ui.ts";

const phrases: { emoji: string; text: string }[] = [
  { emoji: "frogcry", text: "*bored. hungry. still here.*" },
  { emoji: "frogwow", text: "*we ate. and we will eat again.*" },
  { emoji: "frogcry", text: "*still staring at the same messages since 2023.*" },
  { emoji: "frogwow", text: "*today's catch quota: met.*" },
  { emoji: "froge", text: "*waiting. watching. judging.*" },
  { emoji: "frogcry", text: "*no flies today... snacks are getting expensive.*" },
  { emoji: "frogwow", text: "*heard a bot sneeze three servers away. lunch?*" },
  { emoji: "froghuh", text: "*the channel hums. i hum back. it's a duet now.*" },
  { emoji: "frogcry", text: "*the frog channel grass grows. i do not.*" },
  { emoji: "frogwow", text: "*one day i will catch a real spammer. today was not that day.*" },
  { emoji: "frogcry", text: "*blinked. nothing changed. blinked again. still nothing.*" },
  { emoji: "froge", text: "*somewhere, a bot is spamming. i can feel it in my bones.*" },
  { emoji: "frogwow", text: "*the log channel is so empty today. peaceful. suspicious.*" },
  { emoji: "froghuh", text: "*is anyone even reading these? probably not. hopping on anyway.*" },
  { emoji: "frogcry", text: "*my pond is a chat channel now. i've adapted. barely.*" },
  { emoji: "frogwow", text: "*ribbit. that's frog for 'i'm still watching'.*" },
  { emoji: "froge", text: "*the humans think i can't read. i can. i see everything.*" },
  { emoji: "frogcry", text: "*another hour. another hundred bots i could have caught.*" },
  { emoji: "frogwow", text: "*a spider built a web in the corner. they're freeloaders too.*" },
  { emoji: "froghuh", text: "*what if the spammer was inside us all along? deep. moving on.*" },
  { emoji: "frogcry", text: "*hunger update: severe. fly update: none.*" },
  { emoji: "frogwow", text: "*caught a typo in my own head. dinner.*" },
  { emoji: "froge", text: "*i protect this server. nobody asked. nobody thanked. i stay.*" },
  { emoji: "frogcry", text: "*the pinned warning keeps getting read. nobody listens. classic.*" },
  { emoji: "frogwow", text: "*one more message and i might just snap my tongue.*" },
  { emoji: "froghuh", text: "*counting pixels on this screen. 1,024. the flies are around here somewhere.*" },
  { emoji: "frogcry", text: "*every server i join, same story. they never believe the frog until it's too late.*" },
  { emoji: "frogwow", text: "*softban of the day inbound. stay tuned.*" },
  { emoji: "froge", text: "*i don't sleep. i wait. there's a difference.*" },
  { emoji: "frogcry", text: "*the koi fish in the other server are thriving. i'm not jealous. i'm furious.*" },
  { emoji: "frogwow", text: "*my reflexes are unmatched. a message blinked and i'm already ready.*" },
  { emoji: "froge", text: "*i've memorized every bot signature. amateur hour never ends.*" },
  { emoji: "frogcry", text: "*it's been three hours since my last 'caught'. withdrawal symptoms.*" },
  { emoji: "froghuh", text: "*is a trap still a trap if everyone knows about it? yes. even better.*" },
  { emoji: "frogwow", text: "*the warnings are up, the tongue is ready, the frog is seated.*" },
  { emoji: "frogcry", text: "*they renamed me a 'moderation tool'. i'm a hunter. but fine.*" },
  { emoji: "froge", text: "*tip for spammers: don't. it's not worth the kick.*" },
  { emoji: "frogcry", text: "*my shadow is shaped like a channel. i've been here too long.*" },
  { emoji: "frogcry", text: "*they said be patient. they did not say be hungry.*" },
  { emoji: "frogwow", text: "*caught 2,256 flies across the pond. the legends grow.*" },
];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function panel(content: string): any {
  return { type: 17, accent_color: 0x1d3f3a, components: [{ type: 10, content }] };
}

async function postOnce(client: Client): Promise<void> {
  const candidates = [...client.guilds.cache.values()].filter((g) => {
    const cfg = ensure(g.id);
    return cfg.trap_channel && g.channels.cache.get(cfg.trap_channel);
  });
  if (!candidates.length) return;
  const guild = rand(candidates);
  const channel = guild.channels.cache.get(ensure(guild.id).trap_channel!) as any;
  if (!channel?.isTextBased?.()) return;
  const p = rand(phrases);
  await channel.send({ components: [panel(`${em(p.emoji)} ${p.text}`)], flags: flag_v2 }).catch(() => {});
}

const low = 45 * 60_000;
const high = 6 * 60 * 60_000;

export function start(client: Client): void {
  const loop = () => {
    postOnce(client);
    const delay = low + Math.random() * (high - low);
    setTimeout(loop, delay);
  };
  setTimeout(loop, low);
}
