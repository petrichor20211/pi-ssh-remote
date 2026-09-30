import { existsSync, readFileSync, statSync } from "node:fs";
import ssh2, { type Client as SshClient, type ClientChannel, type ParsedKey } from "ssh2";
import { cacheId, type ParsedSsh } from "./config.ts";
import { connect, type SshAuthentication } from "./connection.ts";

export interface SshCredentialCache {
  passwords: Map<string, string>;
  keyPassphrases: Map<string, string>;
}

export type SecretPrompt = (label: string, placeholder: string) => Promise<string | null>;

const { utils: ssh2Utils } = ssh2;
const MAX_PRIVATE_KEY_BYTES = 1024 * 1024;

function identityPath(config: ParsedSsh): string {
  if (!config.identityFile) throw new Error("No SSH identity file is configured");
  return config.identityFile;
}

function readPrivateKey(config: ParsedSsh): Buffer {
  const path = identityPath(config);
  let stat;
  try { stat = statSync(path); }
  catch (error) { throw new Error(`Cannot access SSH private key ${path}: ${(error as Error).message}`); }
  if (!stat.isFile()) throw new Error(`SSH private key is not a regular file: ${path}`);
  if (stat.size > MAX_PRIVATE_KEY_BYTES) throw new Error(`SSH private key exceeds the ${MAX_PRIVATE_KEY_BYTES}-byte limit: ${path}`);
  try { return readFileSync(path); }
  catch (error) { throw new Error(`Cannot read SSH private key ${path}: ${(error as Error).message}`); }
}

function parsePrivateKey(keyData: Buffer, passphrase?: string): ParsedKey | Error {
  let parsed: ParsedKey | ParsedKey[] | Error;
  try { parsed = ssh2Utils.parseKey(keyData, passphrase); }
  catch (error) { return error as Error; }
  if (parsed instanceof Error) return parsed;
  const keys = Array.isArray(parsed) ? parsed : [parsed];
  const privateKeys = keys.filter((key) => key?.isPrivateKey?.());
  if (privateKeys.length !== 1) {
    return new Error(privateKeys.length ? "SSH identity files containing multiple private keys are not supported" : "SSH identity file does not contain a private key");
  }
  return privateKeys[0];
}

function isPassphraseError(error: Error): boolean {
  return /passphrase|encrypted private/i.test(error.message);
}

// The extension owns the process-lifetime cache; authentication has no Pi UI dependency.
export function createSshAuthenticator(credentialCache: SshCredentialCache) {
  function getCachedPassword(config: ParsedSsh): string | undefined {
    return credentialCache.passwords.get(cacheId(config));
  }

  function setCachedPassword(config: ParsedSsh, password: string): void {
    credentialCache.passwords.set(cacheId(config), password);
  }

  function deleteCachedPassword(config: ParsedSsh): void {
    credentialCache.passwords.delete(cacheId(config));
  }

  function keyPassphraseId(config: ParsedSsh): string {
    return `${cacheId(config)}|${identityPath(config)}`;
  }

  function getCachedKeyPassphrase(config: ParsedSsh): string | undefined {
    return credentialCache.keyPassphrases.get(keyPassphraseId(config));
  }

  function setCachedKeyPassphrase(config: ParsedSsh, passphrase: string): void {
    credentialCache.keyPassphrases.set(keyPassphraseId(config), passphrase);
  }

  function deleteCachedKeyPassphrase(config: ParsedSsh): void {
    for (const identityFile of config.identityFile ? [config.identityFile] : config.identityFiles ?? []) {
      credentialCache.keyPassphrases.delete(keyPassphraseId({ ...config, identityFile }));
    }
  }

  const privateKeyAuthentication = async (parsed: ParsedSsh, prompt?: SecretPrompt): Promise<SshAuthentication> => {
    const keyData = readPrivateKey(parsed);
    let passphrase = getCachedKeyPassphrase(parsed);
    let privateKey = parsePrivateKey(keyData, passphrase);
    if (privateKey instanceof Error && isPassphraseError(privateKey)) {
      if (passphrase) deleteCachedKeyPassphrase(parsed);
      if (!prompt) throw new Error(`SSH private key ${identityPath(parsed)} requires its passphrase again; reconnect interactively`);
      passphrase = await prompt(`Passphrase for ${parsed.identityFile}`, "private key passphrase") ?? undefined;
      if (!passphrase) throw new Error("No SSH private key passphrase was provided");
      privateKey = parsePrivateKey(keyData, passphrase);
      if (privateKey instanceof Error) {
        deleteCachedKeyPassphrase(parsed);
        throw new Error(`Could not unlock SSH private key ${identityPath(parsed)}: ${privateKey.message}`);
      }
      setCachedKeyPassphrase(parsed, passphrase);
    }
    if (privateKey instanceof Error) {
      throw new Error(`Invalid SSH private key ${identityPath(parsed)}: ${privateKey.message}`);
    }
    return { privateKey: keyData, ...(passphrase ? { passphrase } : {}) };
  };

  const authenticateHop = async (
    hop: ParsedSsh, fingerprint: string, socket: () => Promise<ClientChannel | undefined>, prompt?: SecretPrompt,
  ): Promise<SshClient> => {
    // Keep credential prompts outside the SSH handshake timeout. Only an
    // authentication rejection advances to another credential, not a broken route.
    let lastError: Error = new Error(`No usable SSH credentials for ${hop.label}`);
    const attempt = async (authentication: SshAuthentication): Promise<SshClient | undefined> => {
      try { return await connect(hop, authentication, fingerprint, await socket()); }
      catch (error) {
        const failure = error as Error & { level?: string };
        if (failure.level !== "client-authentication" && failure.level !== "agent") throw error;
        lastError = failure;
        return undefined;
      }
    };
    // An explicit -i remains exclusive, preserving the existing contract.
    if (hop.identityFile) return connect(hop, await privateKeyAuthentication(hop, prompt), fingerprint, await socket());
    if (hop.agent) {
      const client = await attempt({ agent: hop.agent });
      if (client) return client;
    }
    for (const identityFile of hop.identityFiles ?? []) {
      if (!existsSync(identityFile)) continue;
      const client = await attempt(await privateKeyAuthentication({ ...hop, identityFile }, prompt));
      if (client) return client;
    }
    const cachedPassword = getCachedPassword(hop);
    if (cachedPassword) {
      const client = await attempt({ password: cachedPassword });
      if (client) return client;
      deleteCachedPassword(hop);
    }
    if (!prompt) throw lastError;
    const password = await prompt(`SSH password for ${hop.label}`, "password");
    if (!password) throw new Error(`No SSH password was provided for ${hop.label}; no usable private key or SSH agent authentication succeeded`);
    const client = await connect(hop, { password }, fingerprint, await socket());
    setCachedPassword(hop, password);
    return client;
  };

  const forget = (hop: ParsedSsh): void => {
    deleteCachedPassword(hop);
    deleteCachedKeyPassphrase(hop);
  };

  return { authenticateHop, forget };
}
