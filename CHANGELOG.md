# Changelog

All notable user-visible changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Release dates are npm publication dates, and versions follow this repository's pre-1.0 versioning policy documented in `AGENTS.md`.

## [Unreleased]

### Added

- None.

### Changed

- None.

### Fixed

- Stored SSH config, known hosts, and server memory in Pi's agent directory (`~/.pi/agent`, or `PI_CODING_AGENT_DIR`) instead of falling back to the current working directory when `HOME` is unset, which mainly affected Windows.
- Expanded `ssh -i ~/...` identity paths with the user home directory from `os.homedir()`, so private keys resolve on Windows.

## [0.1.12] - 2026-08-25

### Added

- None.

### Changed

- Simplified the server-memory documentation to focus on adding, listing, updating, and deleting entries without exposing implementation details.

### Fixed

- Prevented follow-up SSH client errors during a connection loss before handshake from becoming an uncaught exception that exits Pi.

## [0.1.11] - 2026-08-16

### Added

- Added per-`user@host` server-memory JSON files with stable `id` and `content` entries, plus automatic migration from legacy string memories.
- Added a local-path exception so Pi's normal `read`, `edit`, and `write` tools can manage the active server's memory file while other operations remain routed over SSH.
- Added `/remote memory` to display the current server's memory entries, IDs, and JSON file path.

### Changed

- Replaced agent-side append/clear memory mutations with prompt-guided entry-level CRUD on the JSON file. Deletion instructions now require an explicit user request, an exact entry ID, and preservation of unrelated entries.
- Removed `/remote config memory`; the dedicated `/remote memory` command now handles display, while the `remote` tool's `memory` action locates and inspects the JSON file.

### Fixed

- None.

## [0.1.10] - 2026-08-16

### Added

- None.

### Changed

- None.

### Fixed

- Prevented the agent-facing `memory` action from clearing or replacing server memory accidentally: omission now inspects the saved memory, non-empty text appends idempotently, empty text is rejected, and clearing requires an explicit `--clear` value.

## [0.1.9] - 2026-08-12

### Added

- None.

### Changed

- Removed the redundant `SSH remote` prefix from footer status labels.

### Fixed

- Kept injected server memory as a single stable context prefix so tool continuations do not repeatedly move it to the end of the conversation or invalidate cached provider context.

## [0.1.8] - 2026-08-10

### Added

- Added explicit private-key authentication through `ssh -i KEY`, including passphrase-protected keys and in-memory passphrase caching for reconnects.

### Changed

- Renamed the agent-facing `ssh_remote_control` tool to the shorter `remote` name, matching the `/remote` command.
- Server memory is now keyed by `user@host` and shared across SSH ports; existing endpoint memories are migrated automatically.
- `/remote forget` now clears cached private-key passphrases as well as passwords.

### Fixed

- None.

## [0.1.7] - 2026-08-05

### Added

- Added non-secret, session-scoped SSH workspace state for endpoint, remote directory, tool-routing mode, and port forwards.

### Changed

- `/new` now inherits the active SSH workspace, forks and clones retain their source workspace, and `/resume` restores the selected historical session's recorded workspace.
- Session changes close the previous transport cleanly and reconnect the target workspace without storing passwords or other credentials in session files.

### Fixed

- None.

## [0.1.6] - 2026-08-05

### Added

- Added configurable line and byte budgets for remote reads, remote commands, and aggregate per-turn tool output.
- Added bounded range reads for remote text files with normal `offset` and `limit` continuation.

### Changed

- Remote text reads now default to 400 lines or 16 KB, remote command results default to the last 200 lines or 8 KB, and each agent turn defaults to a shared 32 KB remote output budget.
- Remote command output now streams through bounded buffers, with complete oversized stdout written to a permission-restricted local temporary file.
- Collapsed command previews are now limited to at most 50 visual lines and remain independent from model-facing output.
- Moved the complete release history into this changelog and kept concise release indexes in the English and Chinese READMEs.

### Fixed

- Fixed remote text reads downloading complete files over SFTP before applying line and byte limits.
- Fixed `ssh_remote_control exec` accumulating complete stdout in memory before truncation.

## [0.1.5] - 2026-08-04

### Added

- Added persistent, endpoint-specific server memory through `/remote config memory TEXT` and the `ssh_remote_control` `memory` action.
- Added automatic injection of that memory into every model request while the matching endpoint is the active remote workspace.

### Changed

- Server memory is removed from subsequent model requests when remote tool routing is disabled, including disconnect and tunnel-only mode.
- `/remote config` now shows the memory stored for each endpoint.

### Fixed

- None.

## [0.1.4] - 2026-07-31

### Added

- Added persistent endpoint notes through `/remote config note TEXT` and the `ssh_remote_control` `note` action.
- Added per-command timeout overrides through `/remote exec --timeout SECONDS` and the tool's `timeout` parameter.

### Changed

- Remote commands now default to a 30-second timeout and endpoint notes appear in status, connection, reconnection, and footer labels.
- Expanded the documentation around agent-first workflows, multi-server operation, background jobs, and tunnel mode.

### Fixed

- Fixed remote commands that could run without a deadline by enforcing GNU `timeout` remotely and a local fallback timer.
- Fixed timeout reporting for processes terminated with timeout-related exit codes 124 and 137.

## [0.1.3] - 2026-07-24

### Added

- Added configurable collapsed command previews with `/remote config display-lines N`, `/remote exec --lines N`, and the tool's `displayLines` parameter.
- Added expandable custom rendering for remote command results.

### Changed

- Remote command previews default to the last five visual lines while model-facing output remains limited to 2,000 lines or 50 KB.
- Oversized complete output is saved to a permission-restricted local temporary file.

### Fixed

- Fixed `/remote exec` truncating its notification to an arbitrary 4,000 characters without preserving or identifying the full output.

## [0.1.2] - 2026-07-24

### Added

- None.

### Changed

- Republished the 0.1.1 runtime as 0.1.2 to align npm package version metadata; there were no runtime code changes.

### Fixed

- None.

## [0.1.1] - 2026-07-24

### Added

- Added the shorter `/remote ssh USER@HOST [-p PORT]` connection command.

### Changed

- `/remote ssh` now saves, selects, and immediately connects to the endpoint instead of only storing it.

### Fixed

- Fixed help and error text that still instructed users to run the obsolete `/remote config ssh ssh ...` form.

## [0.1.0] - 2026-07-24

### Added

- Initial release with persistent multi-endpoint SSH workspaces and remote working directories.
- Added transparent routing for Pi's `read`, `write`, `edit`, `bash`, and user shell operations.
- Added SSH-agent/password authentication, interactive host-key verification, automatic reconnection, SFTP file access, bounded command output, and local TCP forwarding.

### Changed

- None.

### Fixed

- None.

[Unreleased]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.12...HEAD
[0.1.12]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/petrichor20211/pi-ssh-remote/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/petrichor20211/pi-ssh-remote/releases/tag/v0.1.4
[0.1.3]: https://www.npmjs.com/package/pi-ssh-remote/v/0.1.3
[0.1.2]: https://www.npmjs.com/package/pi-ssh-remote/v/0.1.2
[0.1.1]: https://www.npmjs.com/package/pi-ssh-remote/v/0.1.1
[0.1.0]: https://www.npmjs.com/package/pi-ssh-remote/v/0.1.0
