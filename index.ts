import "./src/core/proxy.ts";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import config from "./config.ts";
import { loadCmds, loadEvts } from "./src/core/loader.ts";
import { proxyAgent } from "./src/core/proxy.ts";
import { startDashboard } from "./src/dashboard/server.ts";

process.on("unhandledRejection", (err) => console.error("[CRASH] Unhandled Rejection:", err));
process.on("uncaughtException", (err) => console.error("[CRASH] Uncaught Exception:", err));

const client = new Client({
  rest: proxyAgent ? { agent: proxyAgent } : undefined,
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.GuildMember, Partials.User],
});
// L'antiraid enregistre de nombreux handlers sur les mêmes événements.
client.setMaxListeners(50);
client.config = config;

await loadCmds(client);
await loadEvts(client);

if (config.dashboardEnabled) {
  startDashboard(client);
}

if (!config.token) {
  console.error("[config] TOKEN manquant : copiez .env.example vers .env et renseignez-le.");
  process.exit(1);
}

await client.login(config.token);
