import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import SSHConfig, { glob as matchesSshHost } from "ssh-config";
import { quote, shellWords } from "../shell.ts";

export interface ParsedSsh {
  host: string;
  port: number;
  username: string;
  identityFile?: string;
  identityFiles?: string[];
  agent?: string;
  jumps?: ParsedSsh[];
  label: string;
  command: string;
}

function isHomeRelativePath(filePath: string): boolean {
  return filePath === "~" || filePath.startsWith("~/");
}

// Resolve the supported SSH config subset without executing Match/ProxyCommand
// or requiring an OpenSSH binary. The same resolver is used for every hop.
function loadSshConfig(): SSHConfig {
  const path = join(homedir(), ".ssh", "config");
  if (!existsSync(path)) return new SSHConfig();
  return SSHConfig.parse(readFileSync(path, "utf8"));
}

function sshHostOptions(config: SSHConfig, alias: string): Record<string, string | string[]> {
  const applicable = new SSHConfig();
  for (const line of config) {
    if (line.type !== SSHConfig.DIRECTIVE) continue;
    if (/^Match$/i.test(line.param)) throw new Error("SSH config Match sections are not supported");
    if (/^Host$/i.test(line.param) && "config" in line) {
      const patterns = typeof line.value === "string" ? line.value : line.value.map((part) => part.val);
      if (matchesSshHost(patterns, alias)) applicable.push(...line.config);
    } else {
      applicable.push(line);
    }
  }
  // Flatten matching Host blocks first: compute only merges values, never runs
  // the parser's Match exec or hostname-canonicalization subprocesses.
  const options = applicable.compute(alias, { ignoreCase: true, matchExec: false });
  if (options.include !== undefined) throw new Error(`SSH config include is not supported for ${alias}`);
  for (const option of ["proxycommand", "canonicalizehostname"]) {
    const value = options[option];
    if (value !== undefined && value !== "none" && value !== "no") {
      throw new Error(`SSH config ${option} is not supported for ${alias}`);
    }
  }
  return options;
}

function expandSshPath(path: string, tokens: Record<string, string>): string {
  const expanded = path.replace(/%./g, (token) => {
    const value = tokens[token[1]!];
    if (value === undefined) throw new Error(`Unsupported SSH config token ${token}`);
    return value;
  });
  if (isHomeRelativePath(expanded)) return join(homedir(), expanded.slice(2));
  if (expanded.startsWith("~")) throw new Error(`Unsupported SSH home path: ${expanded}`);
  return resolve(homedir(), expanded);
}

function resolveSshHost(
  config: SSHConfig,
  alias: string,
  command: string,
  overrides: { port?: number; username?: string; identityFile?: string; proxyJump?: string } = {},
  ancestors: string[] = [],
): ParsedSsh {
  const options = sshHostOptions(config, alias);
  const localUser = process.env.USER || process.env.USERNAME || "root";
  const username = overrides.username ?? String(options.user ?? localUser);
  const host = String(options.hostname ?? alias).replace(/%h/g, alias);
  const port = overrides.port ?? Number(options.port ?? 22);
  if (!host || !username || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid SSH host, username or port");
  const routeId = `${username}@${alias}:${port}`;
  if (ancestors.includes(routeId)) throw new Error(`Cyclic SSH ProxyJump: ${[...ancestors, routeId].join(" → ")}`);
  const tokens = { "%": "%", d: homedir(), h: host, n: alias, p: String(port), r: username, u: localUser };
  const configuredKeys = options.identityfile as string[] | undefined;
  const identityFiles = [...new Set((overrides.identityFile ? [overrides.identityFile] : configuredKeys ?? [
    "~/.ssh/id_ed25519", "~/.ssh/id_ecdsa", "~/.ssh/id_rsa",
  ]).filter((path) => path !== "none").map((path) => expandSshPath(path, tokens)))];
  const identityAgent = options.identityagent;
  const agent = overrides.identityFile || options.identitiesonly === "yes" || identityAgent === "none"
    ? undefined
    : identityAgent && identityAgent !== "SSH_AUTH_SOCK"
      ? expandSshPath(String(identityAgent), tokens)
      : process.env.SSH_AUTH_SOCK;
  const proxyJump = overrides.proxyJump ?? options.proxyjump;
  const jumps = proxyJump && proxyJump !== "none" ? String(proxyJump).split(",").flatMap((value) => {
    const match = value.trim().match(/^(?:([^@\s,]+)@)?(\[[^\]\s]+\]|[^:@\s,]+)(?::(\d+))?$/);
    if (!match) throw new Error(`Invalid SSH jump host: ${value}; expected [USER@]HOST[:PORT]`);
    const hop = resolveSshHost(config, match[2]!.replace(/^\[|\]$/g, ""), `ssh ${quote(value)}`, {
      username: match[1], port: match[3] === undefined ? undefined : Number(match[3]),
    }, [...ancestors, routeId]);
    const { jumps: preceding, ...destination } = hop;
    return [...(preceding ?? []), destination];
  }) : [];
  return {
    host, port, username, command, label: `${username}@${host}:${port}`,
    ...(overrides.identityFile ? { identityFile: identityFiles[0] } : {}),
    identityFiles, ...(agent ? { agent } : {}), ...(jumps.length ? { jumps } : {}),
  };
}

export function parseSshCommand(command: string): ParsedSsh {
  const args = shellWords(command);
  if (args[0] !== "ssh") throw new Error("Command must start with ssh, for example: ssh root@host -p 22");
  let port: number | undefined;
  let username: string | undefined;
  let identityFile: string | undefined;
  let target: string | undefined;
  let proxyJump: string | undefined;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-p") { port = Number(args[++i]); continue; }
    if (arg.startsWith("-p") && arg.length > 2) { port = Number(arg.slice(2)); continue; }
    if (arg === "-l") {
      username = args[++i];
      if (!username || username.startsWith("-")) throw new Error("SSH option -l requires a username");
      continue;
    }
    if (arg === "-i") {
      if (identityFile !== undefined) throw new Error("Only one SSH identity file may be specified");
      identityFile = args[++i];
      if (!identityFile) throw new Error("SSH option -i requires a private key path");
      continue;
    }
    if (arg.startsWith("-i") && arg.length > 2) {
      if (identityFile !== undefined) throw new Error("Only one SSH identity file may be specified");
      identityFile = arg.slice(2);
      continue;
    }
    if (arg.startsWith("-J") || arg.startsWith("-o")) {
      let value = arg.length === 2 ? args[++i] : arg.slice(2);
      if (arg.startsWith("-o")) {
        const option = value?.match(/^ProxyJump(?:=|\s+)(.+)$/i);
        if (!option) throw new Error("Only -o ProxyJump=... is supported");
        value = option[1];
      }
      if (!value || value.startsWith("-")) throw new Error("SSH option -J requires a jump host");
      if (proxyJump !== undefined) throw new Error("Specify one ProxyJump list; separate multiple jump hosts with commas");
      proxyJump = value;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unsupported SSH option ${arg}; only -p, -l, -i, -J, and -o ProxyJump=... are supported`);
    if (!target) target = arg;
    else throw new Error("Unexpected extra argument in SSH command");
  }
  if (!target) throw new Error("Invalid SSH host or port");
  if (identityFile && !isHomeRelativePath(identityFile) && !isAbsolute(identityFile)) {
    throw new Error("SSH identity file must use an absolute path or ~/...");
  }
  const at = target.lastIndexOf("@");
  const host = (at >= 0 ? target.slice(at + 1) : target).replace(/^\[|\]$/g, "");
  if (at >= 0) username = target.slice(0, at);
  if (!host || username === "") throw new Error("Invalid SSH username or host");
  return resolveSshHost(loadSshConfig(), host, command, { port, username, identityFile, proxyJump });
}

export function cacheId(config: ParsedSsh): string {
  return `${config.username}@${config.host}:${config.port}`;
}
