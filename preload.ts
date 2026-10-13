// Pré-chargé via `bun --preload ./preload.ts` (voir package.json).
// S'exécute AVANT tout autre module — donc avant que @discordjs/ws ne
// capture `globalThis.WebSocket` pour le gateway Discord.
// Sans proxy configuré, ne fait rien (le WebSocket natif est utilisé).
import { GatewayWebSocket } from "./src/core/gateway-ws.ts";

if (process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY) {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = GatewayWebSocket;
  console.log("[preload] WebSocket du gateway remplacé (mode proxy)");
}
