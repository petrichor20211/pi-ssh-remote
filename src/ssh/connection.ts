import ssh2, { type Client as SshClient, type ClientChannel, type ConnectConfig } from "ssh2";
import type { ParsedSsh } from "./config.ts";

const { Client } = ssh2;
const SSH_HANDSHAKE_TIMEOUT_MS = 30_000;

export function probeFingerprint(config: ParsedSsh, sock?: ClientChannel): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.destroy();
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error("Connection timed out")), SSH_HANDSHAKE_TIMEOUT_MS + 2000);
    client.on("error", fail);
    client.once("close", () => fail(new Error("SSH connection closed before host verification")));
    const options: ConnectConfig = {
      ...(sock ? { sock } : {}),
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: SSH_HANDSHAKE_TIMEOUT_MS,
      hostHash: "sha256",
      hostVerifier: (hash: string) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(hash); }
        setImmediate(() => client.end());
        return false;
      },
    };
    try { client.connect(options); }
    catch (error) { fail(error as Error); }
  });
}

export type SshAuthentication = Partial<Pick<ConnectConfig, "password" | "privateKey" | "passphrase" | "agent">>;

export function connect(config: ParsedSsh, authentication: SshAuthentication, fingerprint: string, sock?: ClientChannel): Promise<SshClient> {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const options: ConnectConfig = {
      ...(sock ? { sock } : {}),
      host: config.host,
      port: config.port,
      username: config.username,
      ...authentication,
      readyTimeout: SSH_HANDSHAKE_TIMEOUT_MS,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostHash: "sha256",
      hostVerifier: (hash: string) => hash === fingerprint,
    };
    client.once("ready", () => resolve(client));
    // ssh2 may emit a socket error followed by a protocol error while a
    // connection is lost during handshake. Keep consuming client errors after
    // the first one so EventEmitter does not turn the follow-up into an
    // uncaught exception; rejecting an already-settled promise is a no-op.
    client.on("error", (error) => { client.destroy(); reject(error); });
    client.once("close", () => reject(new Error("SSH connection closed before ready")));
    try { client.connect(options); }
    catch (error) { client.destroy(); reject(error); }
  });
}

export function jumpSocket(client: SshClient, target: ParsedSsh): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, stream?: ClientChannel) => {
      if (settled) { stream?.destroy(); return; }
      settled = true;
      clearTimeout(timer);
      client.removeListener("close", onClose);
      if (error) reject(error);
      else resolve(stream!);
    };
    const onClose = () => finish(new Error("SSH jump connection closed"));
    const timer = setTimeout(() => finish(new Error(`SSH jump forwarding to ${target.label} timed out`)), SSH_HANDSHAKE_TIMEOUT_MS);
    client.once("close", onClose);
    try { client.forwardOut("127.0.0.1", 0, target.host, target.port, (error, stream) => finish(error, stream)); }
    catch (error) { finish(error as Error); }
  });
}
