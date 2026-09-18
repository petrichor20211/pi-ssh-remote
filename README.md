<!--
Agent-first English documentation for pi-ssh-remote. It explains the extension's design, transparent tool routing, persistent workspace model, safety boundaries, compelling workflows, commands, and installation requirements.
-->

# pi-ssh-remote

**SSH designed for agents—not just for terminals.**

[中文文档](README.zh-CN.md) · [Community](https://linux.do/)

`pi-ssh-remote` turns a remote machine into Pi's active workspace. After connecting, the agent keeps using its normal `read`, `write`, `edit`, and `bash` tools, but those operations run on the remote server. There is no need to wrap every action in `ssh ...`, copy files back and forth, or make the model reason about two unrelated shells.

```text
You: Connect to ssh root@gpu-box -p 2202, open /srv/training,
     find why the latest run failed, fix it, and restart it in the
     background. Return the PID and log path.

Pi:  connects → changes the persistent remote cwd → reads logs →
     edits remote files → launches the job on the GPU server
```

## Designed for agent workflows

### The remote machine becomes the agent's workspace

Once connected, Pi's file tools, shell tool, and `!` user shell commands are transparently routed over SSH. The agent can inspect a repository, search logs, edit code, and run tests with the same tool interface it uses locally.

### Agent control plane, human control plane

The extension exposes `remote` for the agent and `/remote` for the user. You can ask Pi to connect, inspect status, change directory, add a server note, execute a command, create a tunnel, or return to local work in natural language—and still take direct control whenever you want.

### Stateful endpoints instead of disposable SSH commands

Each `user@host:port` endpoint remembers its remote working directory, note, and port-forward configuration locally. Notes such as `H100 training`, `staging`, or `customer demo` appear in configuration, status messages, and Pi's footer, so the active execution environment stays visible.

### Resilient and bounded by default

Dropped connections are automatically re-established during the active session. SSH workspace state is also session-aware: `/new` inherits the current workspace, forks and clones retain their source workspace, and `/resume` restores the selected session's recorded endpoint, remote directory, routing mode, and forwards. Remote commands have a 30-second default timeout. Remote text reads fetch focused ranges instead of downloading complete files, command output is streamed through bounded buffers, and a 32 KB per-turn budget prevents parallel tools from flooding model context. Complete oversized command output is preserved in a permission-restricted temporary file.

### Hybrid local/remote workflows

Tunnel mode forwards remote services to localhost while returning Pi's tools to the local machine. This is useful when the backend runs on a GPU server but the client, browser automation, or integration code lives locally.

## Why not just run `ssh` in Bash?

| Plain SSH command | `pi-ssh-remote` |
|---|---|
| Each tool call must wrap or reconstruct SSH | All agent file and shell tools route automatically |
| Working directory is easy to lose between calls | Remote cwd is persistent and visible |
| The model must track whether it is local or remote | Pi's prompt and footer identify the active workspace |
| Disconnects break the workflow | Active-session connections automatically reconnect |
| Tunneling and remote editing are separate setups | Workspace routing and port forwarding share one control plane |
| Large output can flood context | Preview and model-output limits are built in |

## Install

```bash
pi install npm:pi-ssh-remote
```

Requires Node.js 20+. The remote server must provide Bash, SFTP, and GNU `timeout`.

## Quick start

```text
/remote ssh root@gpu-box.example.com -p 2202
/remote cd /srv/project
/remote config note H100 training server
/remote status
```

From this point, normal Pi operations target `/srv/project` on the remote server. The footer makes that routing explicit:

```text
H100 training server (root@gpu-box.example.com:2202):/srv/project
```

Return to local tools with:

```text
/remote off
```

### Server memory

Tell Pi what to remember for the current server:

```text
Remember for this server: use /opt/conda/bin/python and never stop shared jobs.
```

List saved entries and their IDs:

```text
/remote memory
```

Use an ID to update or delete an entry:

```text
Update memory deploy-command to use /opt/deploy/v2/run.sh.
Delete memory obsolete-proxy-rule.
```

Pi automatically applies saved memory when you work on that server. Deletion only happens when you explicitly request it.

### Private key authentication

Pass an explicit local private key with `-i`:

```text
/remote ssh -i ~/.ssh/id_ed25519 root@gpu-box.example.com -p 2202
```

Identity paths must be absolute or start with `~/`. Unencrypted and passphrase-protected private keys are supported. Pi prompts for an encrypted key's passphrase and caches it only in the current process for reconnects; `/remote forget` clears it. When `-i` is present, that key is used exclusively instead of silently falling back to SSH agent or password authentication. Commands without `-i` keep the existing SSH agent and password flow unchanged.

## Examples

### 1. Let the agent investigate and repair a remote failure

```text
Connect to ssh ubuntu@training.example.com -p 22 and work in /opt/app.
Inspect the failed deployment, trace the error through the logs and source,
make the smallest safe fix, run the relevant tests, and show me the diff.
```

The connection is established once. Subsequent reads, searches, edits, and tests are ordinary Pi tool calls routed to the server.

### 2. Launch a long GPU job without blocking the agent

```text
On the current remote server, validate the training command first. Then launch
it with nohup in the background, redirect stdout and stderr from process start,
and report the PID, output directory, and log path. Verify that the process is
still alive and that the log has started.
```

The default foreground timeout prevents an accidental long-running command from occupying the agent indefinitely, while an explicitly backgrounded job continues on the server.

### 3. Keep several machines understandable

```text
/remote ssh root@10.0.0.21 -p 22
/remote config note 8xH100 training
/remote config cwd /srv/train

/remote ssh ubuntu@staging.example.com -p 2222
/remote config note staging API
/remote config cwd /opt/service

/remote config
/remote use root@10.0.0.21:22
/remote
```

Endpoint notes and working directories survive Pi restarts and remain separate for each saved endpoint.

### 4. Expose a remote service while editing locally

```text
/remote config forward 7860:127.0.0.1:7860
/remote forward
```

Now `localhost:7860` reaches the service on the SSH server, while Pi's file and shell tools remain local. This is ideal for a remote model server paired with a local UI or client repository.

Stop the tunnels with:

```text
/remote unforward
```

### 5. Ask Pi directly

```text
Connect to my configured remote, switch to /srv/api, and inspect its Git status.
```

```text
Add the note "production read-only" to this endpoint and tell me which remote
workspace is active.
```

```text
Forward the remote service on port 8000 to localhost:8000, but keep my coding
tools on the local repository.
```

## Command reference

| Command | Purpose |
|---|---|
| `/remote ssh USER@HOST -p PORT [-i KEY]` | Save, select, and connect using agent/password or an explicit private key |
| `/remote` | Connect to the selected endpoint or prompt for one |
| `/remote config` | List saved endpoints and settings |
| `/remote use USER@HOST:PORT` | Select a saved endpoint |
| `/remote config note TEXT` | Persist a note for the selected endpoint |
| `/remote config note --clear` | Clear its note |
| `/remote memory` | List the current server's memory entries and IDs |
| `/remote config cwd PATH` | Persist its default remote working directory |
| `/remote cd PATH` | Change the connected remote cwd and persist it |
| `/remote config forward MAPPING...` | Persist port forwards such as `7860:127.0.0.1:7860` |
| `/remote forward [MAPPING...]` | Start tunnels and keep Pi's tools local |
| `/remote unforward` | Stop extension-managed tunnels |
| `/remote exec COMMAND` | Run one command in the remote cwd |
| `/remote exec --timeout 60 COMMAND` | Override the command timeout |
| `/remote exec --lines 20 COMMAND` | Override collapsed preview lines |
| `/remote config display-lines 10` | Set default collapsed preview lines (maximum 50) |
| `/remote config read-max-lines 400` | Set the remote read line budget |
| `/remote config read-max-bytes 16384` | Set the remote read byte budget |
| `/remote config exec-max-lines 200` | Set the remote command line budget |
| `/remote config exec-max-bytes 8192` | Set the remote command byte budget |
| `/remote config turn-max-bytes 32768` | Set the aggregate per-turn remote output budget |
| `/remote status` | Show the active workspace |
| `/remote reload` | Reconnect the active workspace |
| `/remote off` | Disconnect and return tools to local execution |
| `/remote forget` | Disconnect and clear cached passwords and key passphrases |

## Persistence, output, and security

Endpoint configuration is stored locally in:

```text
~/.pi/agent/ssh-remote-config.json
```

Saved global values include endpoints, active endpoint, notes, remote working directories, forwards, identity file paths, preview settings, and model-output budgets. Each Pi session also stores non-secret SSH workspace metadata so `/resume` can restore the server associated with that session. Private key contents, passwords, and key passphrases are **never written to this file**. Private keys are read locally only when connecting; prompted passwords and passphrases remain only in process memory.

New or changed host keys require interactive confirmation and are stored separately from OpenSSH. By default, remote text reads return at most 400 lines or 16 KB, remote command results return the last 200 lines or 8 KB, and all remote tools in one agent turn share a 32 KB output budget. Text reads support `offset`/`limit` continuation without downloading the complete remote file. Oversized command output is streamed to a permission-restricted temporary local file rather than accumulated in memory. Configured limits may be raised only to the extension's hard safety ceilings. Preview-line settings affect only the collapsed UI and never increase model output.

## Current SSH scope

The extension currently supports direct SSH commands with `-p`, `-l`, and `-i`. It does not yet consume `~/.ssh/config` or ProxyJump settings; use `-i` explicitly instead of relying on an `IdentityFile` entry.

## Releases

Latest release: [v0.1.13](https://github.com/petrichor20211/pi-ssh-remote/releases/tag/v0.1.13)

| Version | Date | Highlights |
|---|---|---|
| [0.1.13](CHANGELOG.md#0113---2026-09-18) | 2026-09-18 | Graceful working-directory fallback, longer SSH handshakes, and Windows path fixes |
| [0.1.12](CHANGELOG.md#0112---2026-08-25) | 2026-08-25 | Safe handling of repeated SSH errors when a connection is lost during handshake |
| [0.1.11](CHANGELOG.md#0111---2026-08-16) | 2026-08-16 | JSON memory entries, prompt-guided CRUD, and `/remote memory` listing |

See [CHANGELOG.md](CHANGELOG.md) for the complete release history, including additions, behavior changes, and bug fixes.

MIT licensed.
