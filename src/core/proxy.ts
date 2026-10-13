import { ProxyAgent } from "undici";
import { GatewayWebSocket } from "./gateway-ws.ts";

// Pont réseau pour les environnements derrière un proxy de sortie (ex: sandbox).
// - REST (@discordjs/rest) : utilise un ProxyAgent undici via les options du Client.
// - Gateway (@discordjs/ws) : sous Bun, le WebSocket global est remplacé par
//   GatewayWebSocket, un client manuel (CONNECT + TLS + upgrade tolérant,
//   framing via le package `ws`) qui fonctionne à travers le proxy.
// Sans HTTPS_PROXY/HTTP_PROXY défini, ce module ne fait strictement rien.

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "";

export const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

if (proxyUrl) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = GatewayWebSocket;
  console.log("[proxy] trafic Discord routé via le proxy de sortie");
} else {
  console.log("[proxy] aucun proxy détecté, connexion directe");
}
