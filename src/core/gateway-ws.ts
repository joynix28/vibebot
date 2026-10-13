import { once } from "node:events";
import { connect as netConnect } from "node:net";
import type { Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { randomBytes } from "node:crypto";
// NOTE : Bun remplace le package "ws" par un shim interne incomplet.
// On importe donc les vraies classes par chemin profond.
// @ts-expect-error - pas de déclaration de types pour l'import profond
import ReceiverImpl from "../../node_modules/ws/lib/receiver.js";
// @ts-expect-error - pas de déclaration de types pour l'import profond
import SenderImpl from "../../node_modules/ws/lib/sender.js";

const Receiver = ReceiverImpl as new () => {
  write(chunk: Buffer): void;
  on(ev: "message", cb: (data: Buffer | string, isBinary: boolean) => void): void;
  on(ev: "ping", cb: (data: Buffer) => void): void;
  on(ev: "error", cb: (err: unknown) => void): void;
};
const Sender = SenderImpl as new (socket: unknown) => {
  send(data: unknown, opts: { binary?: boolean; mask?: boolean; fin?: boolean }, cb?: (err?: Error) => void): void;
  pong(data: Buffer, mask: boolean, cb?: () => void): void;
  close(code: number, reason: string, mask: boolean, cb?: () => void): void;
};

// Client WebSocket manuel pour les environnements où le proxy de sortie
// interfère avec les implémentations classiques :
// - handshake HTTP de l'upgrade fait "à la main" (tolérant sur les headers,
//   ex: Cloudflare répond `Connection: close` sur le 101),
// - framing via les classes Receiver/Sender du package `ws` (éprouvées),
// - tunnel CONNECT + TLS via le proxy HTTP de sortie.
// Expose une façade compatible WHATWG (ce qu'attend @discordjs/ws).

const PROXY_URL = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? "";

function readHttpHead(sock: Socket, timeoutMs = 20000): Promise<{ head: string; rest: Buffer }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        reject(new Error("timeout en lisant la réponse HTTP"));
      }
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      sock.off("data", onData);
      sock.off("error", onError);
      sock.off("close", onClose);
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const idx = buf.indexOf("\r\n\r\n");
      if (idx !== -1 && !done) {
        done = true;
        cleanup();
        resolve({ head: buf.subarray(0, idx).toString("latin1"), rest: buf.subarray(idx + 4) });
      }
    };
    const onError = (err: unknown) => {
      if (!done) {
        done = true;
        cleanup();
        reject(err);
      }
    };
    const onClose = () => {
      if (!done) {
        done = true;
        cleanup();
        reject(new Error("connexion fermée pendant le handshake"));
      }
    };
    sock.on("data", onData);
    sock.on("error", onError);
    sock.on("close", onClose);
  });
}

export class GatewayWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  binaryType: "arraybuffer" | "blob" = "arraybuffer";
  onopen: ((ev: { target: unknown }) => void) | null = null;
  onmessage: ((ev: { data: unknown; target: unknown }) => void) | null = null;
  onerror: ((ev: { error?: unknown; target: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string; target: unknown }) => void) | null = null;

  #readyState = 0;
  #sender: InstanceType<typeof Sender> | null = null;
  #socket: Socket | null = null;

  constructor(url: string | URL, _protocols?: unknown, _options?: unknown) {
    void this.#connect(String(url));
  }

  get readyState(): number {
    return this.#readyState;
  }

  async #connect(url: string): Promise<void> {
    let sock: Socket | null = null;
    try {
      const u = new URL(url);
      const targetPort = u.port ? Number(u.port) : 443;
      const proxy = new URL(PROXY_URL);

      // 1. TCP vers le proxy
      sock = netConnect({ host: proxy.hostname, port: Number(proxy.port) || 8080 });
      await once(sock, "connect");

      // 2. CONNECT
      let connectReq =
        `CONNECT ${u.hostname}:${targetPort} HTTP/1.1\r\n` + `Host: ${u.hostname}:${targetPort}\r\n`;
      if (proxy.username) {
        const creds = Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64");
        connectReq += `Proxy-Authorization: Basic ${creds}\r\n`;
      }
      connectReq += "\r\n";
      sock.write(connectReq);
      const { head: connectHead } = await readHttpHead(sock);
      if (!/^HTTP\/1\.[01] 200/.test(connectHead)) {
        throw new Error(`proxy CONNECT refusé : ${connectHead.split("\r\n")[0]}`);
      }

      // 3. TLS dans le tunnel
      const tls = tlsConnect({ socket: sock, servername: u.hostname });
      await once(tls, "secureConnect");
      sock = tls as unknown as Socket;

      // 4. Upgrade WebSocket manuel (tolérant sur les headers de réponse)
      const key = randomBytes(16).toString("base64");
      tls.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
          `Host: ${u.hostname}\r\n` +
          `Upgrade: websocket\r\n` +
          `Connection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\n` +
          `Sec-WebSocket-Version: 13\r\n` +
          `\r\n`
      );
      const { head: upHead, rest } = await readHttpHead(tls as unknown as Socket);
      if (!/^HTTP\/1\.1 101/.test(upHead)) {
        throw new Error(`upgrade refusé : ${upHead.split("\r\n")[0]}`);
      }

      // 5. Framing via ws
      // IMPORTANT : attacher les listeners AVANT d'écrire quoi que ce soit,
      // sinon le premier message (souvent groupé avec le 101) est perdu.
      this.#socket = tls as unknown as Socket;
      const receiver = new Receiver();
      const sender = new Sender(tls);
      this.#sender = sender;

      receiver.on("message", (data: Buffer | string, isBinary: boolean) => {
        let out: unknown = data;
        if (isBinary && Buffer.isBuffer(data) && this.binaryType === "arraybuffer") {
          out = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
        try {
          this.onmessage?.({ data: out, target: this });
        } catch {
          /* ignore */
        }
      });
      receiver.on("ping", (data: Buffer) => {
        try {
          sender.pong(data, true, undefined);
        } catch {
          /* ignore */
        }
      });
      receiver.on("error", (err: unknown) => {
        this.onerror?.({ error: err, target: this });
      });
      tls.on("error", (err: unknown) => {
        this.onerror?.({ error: err, target: this });
      });
      tls.on("close", () => {
        if (this.#readyState !== 3) {
          this.#readyState = 3;
          try {
            this.onclose?.({ code: 1006, reason: "", target: this });
          } catch {
            /* ignore */
          }
        }
      });

      if (rest.length > 0) receiver.write(rest);
      tls.on("data", (chunk: Buffer) => {
        try {
          receiver.write(chunk);
        } catch {
          /* ignore */
        }
      });

      this.#readyState = 1;
      this.onopen?.({ target: this });
    } catch (err) {
      try {
        sock?.destroy();
      } catch {
        /* ignore */
      }
      this.#readyState = 3;
      const msg = err instanceof Error ? `[gw] ${err.message}` : `[gw] ${String(err)}`;
      this.onerror?.({ error: new Error(msg), target: this });
      this.onclose?.({ code: 1006, reason: msg, target: this });
    }
  }

  send(data: string | ArrayBuffer | Uint8Array | Buffer): void {
    if (!this.#sender || this.#readyState !== 1) {
      throw new Error("WebSocket is not open");
    }
    const binary = typeof data !== "string";
    this.#sender.send(data as never, { binary, mask: true, fin: true }, (err?: Error) => {
      if (err) this.onerror?.({ error: err, target: this });
    });
  }

  close(code = 1000, reason = ""): void {
    if (this.#readyState === 3) return;
    this.#readyState = 2;
    try {
      this.#sender?.close(code, reason, true, undefined);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        this.#socket?.end();
      } catch {
        /* ignore */
      }
      if (this.#readyState !== 3) {
        this.#readyState = 3;
        this.onclose?.({ code, reason, target: this });
      }
    }, 1000).unref?.();
  }
}
