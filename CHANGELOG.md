# Changelog

All notable changes to ask-when-needed are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) ·
Versioning: [Semantic Versioning](https://semver.org/).

## [0.2.0-alpha] – 2026-11-14

Classifier mode, a rewritten detection engine, and a config in which every documented field now
does something. **Expect more prompts for shell commands that touch secret files** – that gap is
closed (see *Added*).

### Added

- **Classifier mode** (`/ask-when-needed classifier`, `"mode": "classifier"`,
  `PI_ASK_WHEN_NEEDED=classifier`): a model decides about flagged actions instead of the user,
  the way [Claude Code's auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
  does. It sees the user's messages and the agent's tool calls – never the agent's own words or
  tool output. A fast yes/no blocks when in doubt; only then the same question is asked again
  with reasoning. A block goes back to the agent, which carries on; after 3 blocks in a row or
  20 in a session the user is asked (without a UI the run ends). `classifier.model` picks a chat
  model (default: the session's model); `classifier.environment`, `block` and `allow` adapt the
  built-in rules.
- **Secret files in shell commands** are detected (`cat .env`, `cat .env*`,
  `cp ~/.aws/credentials …`, `--key=server.pem`, `curl -d @.env`, `docker run -v ~/.aws:/creds`),
  with the same path policies as the read tools. `grep` with a `glob` that names such a file
  (`".env*"`, `"*.pem"`) asks as well.
- `policies`, `pathAccess` and `nonInteractive` are implemented – documented since 1.4.0, ignored
  until now. The built-in path rules became the default policies `secret-files` and
  `protected-dirs` and the default `pathAccess.dangerousPaths`; a config extends them.
- Secret paths `~/.config/{gh,gcloud,op,sops}` (documented since 1.2.0, missing in the code).
  `.env.example` / `.env.sample` / `.env.template` no longer count as secrets.
- `powershell` tool calls run through the same command rules as `bash`, plus rules of their own
  (`matchers-powershell.ts`): recursive `Remove-Item`, `Stop-Process`, `Invoke-Expression` / `iex`,
  `Start-Process -Verb RunAs`, services and scheduled tasks, disk formatting, `Get-ChildItem Env:`.
  Paths with `\` and lines continued with a backtick are understood.
- `/ask-when-needed` completes its arguments and rejects unknown ones. A broken config file is
  reported and the defaults stay active, instead of the file being ignored silently.
- `PI_ASK_WHEN_NEEDED=ask|classifier` switches on even if the config says `"enabled": false`,
  like the command does.

### Fixed

Detection gaps – these ran without a prompt:

- Commands inside quotes or assignments: `echo "$(rm -rf x)"`, `X=$(rm -rf x)`, `foo$(sudo ls)`,
  nested `$(… $(…))`.
- Path-qualified or escaped commands: `/bin/rm -rf x`, `\rm -rf x`, `/usr/bin/sudo`,
  `node_modules/.bin/npm publish`.
- `env` / `set` unless they were the very last word of the command line: `env | grep KEY`,
  `env > file`.
- Git: `git -C dir push`, `git reset HEAD~1 --hard`, `git checkout .`, `git checkout -f`,
  `git clean --force`.
- Containers: `--network host`, `--net=host`, `docker container run …`, `--mount …source=/`,
  `-v/:/host`.
- `read @.env` (Pi strips the leading `@`); `file://` paths were not resolved.
- `allowedPatterns` exempted the whole command line, so `git push --force-with-lease && rm -rf ~`
  ran unasked. They now exempt only the simple command they match, and a plain pattern has to
  match its start.
- The project config was read from untrusted projects; it is now only read when the project is
  trusted.
- A very long one-line command (a pasted data blob) could freeze Pi: every word was compared
  with all words after it. Matchers now see at most 256 words of a command.
- Three levels of brackets, as in `(cd x && docker run … $(dirname $(pwd)))`, made the old
  tokenizer hang.

False alarms:

- Flags leaked across commands: `rm a.txt; grep -rf x .` was reported as `rm -rf`.
- The message of a `git` / `gh` / `glab` command (`-m "…"`, `--message`, `--title`, `--body`,
  `--notes`, `--description`, also fed from a quoted here-document) is text, not a command:
  `git commit -m "fix: kill zombie worker"` no longer asks. A message with `$(…)`, a variable or
  backticks is still scanned.
- `git restore --staged` (only unstages) no longer asks.
- Windows: paths inside the project were treated as outside it.

### Changed

- **`rm -r` without `-f` asks too** – it deletes just as much as `rm -rf`. The prompt says
  "recursive deletion"; `rm -rf` stays "force recursive deletion". `git rm -r` does not ask (Git
  keeps what it removes); `git rm -f` does.
- **Engine** (`matcher-utils.ts`): a command line is split into simple commands at every
  separator, substitution, subshell and redirection, and the matchers slide over each of them.
  A second reading takes nested and escaped parts as plain arguments and leaves redirections
  out, so flags behind them still count (`docker run -v $(pwd):/app --privileged`,
  `find . \( … \) -delete`, `find . 2>/dev/null -delete`).
  This replaces the tokenizer that understood one level of nesting.
- **Two swappable stages**: detect (`detector.ts` ← `matchers-*.ts`, config) and decide (`MODES`
  in `index.ts` ← `decider-*.ts`). A new matcher category or a new mode is one module plus one
  registry line; new commands and path rules need config only.
- `createDetector(config)` replaces `checkBash` / `checkRead` / `checkWrite` / `findDanger`.
  Matchers and patterns are compiled once per session instead of on every tool call.
- Config merging: lists add up, including `pathAccess.dangerousPaths` and the lists of a policy
  with a known `id`; a config written for 0.1 keeps working and cannot weaken the defaults by
  accident. Empty command patterns are rejected.
- An action blocked because nobody could be asked now tells the model not to work around it.
- README: removed "system-wide package installs" (was never detected); prompt labels match the
  real ones.

### Removed

- `npm test` / `npm run check` and the `esbuild` dev dependency – `tests/matchers.mjs` is no
  longer part of the repository.
- Dead code: `getConfig` / `reloadConfig`, unused helper exports, the stale `matchers-network.ts`
  reference.

## [0.1.1-alpha] – 2026-11-06

Repository restructured to the project layout of Lightfox and DOM Picker für LLM, and the
version reset to an alpha. **Detection behaviour is unchanged** (all 95 tests pass).

### Changed

- **Version reset to `0.1.1-alpha`** (previously `1.5.1`). The earlier 1.x numbers were never
  published as stable releases; they are kept below as pre-alpha history.
- Layout: `extensions/ask-when-needed/*.ts` → `src/`, `test-matchers.mjs` → `tests/matchers.mjs`,
  `assets/logo.svg` → `docs/logo.svg`, `example-config.json` → `docs/example-config.json`.
  The Pi entry point is now `./src/index.ts` (`package.json` → `pi.extensions`).
- Tests bundle `src/detector.ts` in memory with esbuild and import it as a `data:` URL, so they
  no longer need Node's TypeScript stripping (`--experimental-strip-types`). Test output is in
  English.
- README: centred logo, badges and EN/DE language switch; development section with project
  structure; fixed a blank line that split the comparison table; removed the outdated claim that
  only `pi-guardrails` detects container escapes.

### Added

- New square logo (`docs/logo.svg`, 128×128): a yellow shield with a question mark – Pi asks
  before anything dangerous. Replaces the old 400×100 text banner.
- `README.de.md` (German).
- `npm` scripts `typecheck`, `test`, `check`; `tsconfig.json`; dev dependencies `typescript`,
  `esbuild`, `@types/node`, `@earendil-works/pi-coding-agent` (types); `engines.node >= 20.19`.

### Removed

- `PLAN.md` (the configurable-settings plan was implemented in 1.4.0).
- Stale `features.network` entry in the example config (network detection was removed in 1.5.0).

## Pre-alpha history (1.0.0 – 1.5.1)

### [1.5.1]

- Added database files (`.db`, `.sqlite`, `.sqlite3`, `.mdb`) to secret-file detection.
- Added SVG logo to README.

### [1.5.0]

- Removed network/exfiltration detection entirely (curl/wget uploads, pipe-to-shell, ssh/scp/rsync, nc/socat) — Pi can fetch from the internet without prompts.
- Removed `network` feature toggle from config.
- All 88 tests pass (10 network tests removed).

### [1.4.2]

- Removed `/ask-when-needed:reload` command (pi's `/reload` already reloads extensions).

### [1.4.1]

- Unified detection engine: structural matchers + substitution scan + config overrides now use one shared engine (`matcher-utils.ts`).
- Consolidated helper names: `hasFlag`, `isCmd`, `hasPrefix` (was: `hasArg`, `hasShortFlag`, `hasLongOption`, `isOneOf`).
- Fixed `hasFlag` to detect grouped short flags (`-rf` → `-r` + `-f`).
- All 98 tests still pass.

### [1.4.0]

- Added configurable JSON settings file (`~/.pi/agent/extensions/ask-when-needed.json` and `.pi/extensions/ask-when-needed.json`).
- Feature toggles per detection category (shell, secrets, git, publish, network, pathPolicies).
- Custom dangerous/allowed command patterns.
- Path policies (like pi-guardrails).
- `/ask-when-needed:reload` command to reload config without restart.
- Extracted preview helpers into `preview.ts`.
- All 98 tests still pass.

### [1.3.2]

- Code cleanup: removed duplicate matcher registration, simplified redundant checks, extracted shared `substitution()` helper, inlined `path_relative`, simplified shell detection. All 98 tests still pass.

### [1.3.1]

- Translated all German comments, docstrings, and user-facing strings to English across the extension and README. No behavior change; all 98 tests still pass.

### [1.3.0]

- Refactored into clean per-category modules: `matchers-shell.ts`, `matchers-secrets.ts`, `matchers-git.ts`, `matchers-publish.ts`, `matchers-network.ts`, `paths.ts`, `detector.ts`, `matcher-utils.ts`, `index.ts`.
- “Write outside project” now only triggers on **dangerous system paths** (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/home/*/.ssh`, `~/.aws`, …; Windows: `C:\Windows`, `System32`, `C:\Users\*\.ssh`, …). Ordinary paths outside the project stay allowed.
- Fixed Windows path normalization (backslashes → `/`) so secret/protected/dangerous-path patterns match.
- All 98 unit tests pass.

### [1.2.2]

- Synced README “What it guards” 1:1 with the extension’s actual detection:
  - Added `find -exec rm`, `truncate`, `wipefs`, `diskutil`, `sudo -E`, `env` (bare), `set` (bare), `git checkout --` / `restore` / `rebase` / `--amend`, `sftp`, `wget | sh`, `gem push`, `twine upload`, and container-escape flags.
  - Added missing secret-file patterns: `.dev.vars`, `~/.gnupg`, `~/.config/{gh,gcloud,op,sops}`, `.p12`, `.gpg`, `id_rsa`/`id_ed25519`.
  - Fixed `wget ... | sh` pipe-to-shell detection (structural instead of regex).
- Aligned netwerk/publishing matchers with the README; all 68 unit tests pass.

### [1.2.1]

- README: refreshed the comparison table to reflect the ~1:1 pi-guardrails detection alignment (container escapes, disk/filesystem, recursive perms, secret reads, command substitution all ✅) and switched the semantics to “asked” (every detection prompts) instead of “blocked”.

### [1.2.0]

- Aligned dangerous-command detection ~1:1 with `pi-guardrails` permission-gate:
  - Added structural matchers for `dd of=`, `mkfs.*`, `wipefs`, `blkdiscard`, `fdisk`/`sfdisk`/`cfdisk`/`parted`/`sgdisk`, recursive `chmod -R 777`-style, `chown -R`, `doas`, `pkexec`, and full container-escape detection (privileged, host namespaces, root-fs mount, docker.sock).
  - Added secret-read policies (`.env`, `~/.ssh`, `~/.config/{gh,gcloud,op,sops}`, `~/.gnupg`, `~/*.gpg`, `printenv`) matching pi-guardrails' policies.
  - Added command-substitution scanning: dangerous calls inside `$(...)` or backticks are now caught (mirrors pi-guardrails' AST behavior).
  - Refactored matching to a sliding-window + recursive-substitution scan.
- Added MIT LICENSE.
- Added `test-matchers.mjs` (54 unit tests). Run: `node --experimental-strip-types test-matchers.mjs`.

### [1.1.0]

- README: added a detection-category comparison table vs. [`pi-guardrails`](https://github.com/aliou/pi-guardrails).

### [1.0.0]

- Initial release.
- Interactive confirmation for dangerous bash commands (deletes, system/privileges, git history/remotes, network/publishing, secrets).
- Write/edit protection: blocks writes outside the project, to secret files (`.env`, `*.pem`, `*.key`), and to protected dirs (`.git/`, `.pi/`).
- Preview of the exact command / unified-diff-style change before each prompt.
- `/ask-when-needed [on|off]` command and `PI_ASK_WHEN_NEEDED` env var to control startup state.
