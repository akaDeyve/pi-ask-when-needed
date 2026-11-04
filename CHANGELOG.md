# Changelog

## 1.4.0

- Added configurable JSON settings file (`~/.pi/agent/extensions/ask-when-needed.json` and `.pi/extensions/ask-when-needed.json`).
- Feature toggles per detection category (shell, secrets, git, publish, network, pathPolicies).
- Custom dangerous/allowed command patterns.
- Path policies (like pi-guardrails).
- `/ask-when-needed:reload` command to reload config without restart.
- Extracted preview helpers into `preview.ts`.
- All 98 tests still pass.

## 1.3.2

- Code cleanup: removed duplicate matcher registration, simplified redundant checks, extracted shared `substitution()` helper, inlined `path_relative`, simplified shell detection. All 98 tests still pass.

## 1.3.1

- Translated all German comments, docstrings, and user-facing strings to English across the extension and README. No behavior change; all 98 tests still pass.

## 1.3.0

- Refactored into clean per-category modules: `matchers-shell.ts`, `matchers-secrets.ts`, `matchers-git.ts`, `matchers-publish.ts`, `matchers-network.ts`, `paths.ts`, `detector.ts`, `matcher-utils.ts`, `index.ts`.
- “Write outside project” now only triggers on **dangerous system paths** (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/home/*/.ssh`, `~/.aws`, …; Windows: `C:\Windows`, `System32`, `C:\Users\*\.ssh`, …). Ordinary paths outside the project stay allowed.
- Fixed Windows path normalization (backslashes → `/`) so secret/protected/dangerous-path patterns match.
- All 98 unit tests pass.

## 1.2.2

- Synced README “What it guards” 1:1 with the extension’s actual detection:
  - Added `find -exec rm`, `truncate`, `wipefs`, `diskutil`, `sudo -E`, `env` (bare), `set` (bare), `git checkout --` / `restore` / `rebase` / `--amend`, `sftp`, `wget | sh`, `gem push`, `twine upload`, and container-escape flags.
  - Added missing secret-file patterns: `.dev.vars`, `~/.gnupg`, `~/.config/{gh,gcloud,op,sops}`, `.p12`, `.gpg`, `id_rsa`/`id_ed25519`.
  - Fixed `wget ... | sh` pipe-to-shell detection (structural instead of regex).
- Aligned netwerk/publishing matchers with the README; all 68 unit tests pass.

## 1.2.1

- README: refreshed the comparison table to reflect the ~1:1 pi-guardrails detection alignment (container escapes, disk/filesystem, recursive perms, secret reads, command substitution all ✅) and switched the semantics to “asked” (every detection prompts) instead of “blocked”.

## 1.2.0

- Aligned dangerous-command detection ~1:1 with `pi-guardrails` permission-gate:
  - Added structural matchers for `dd of=`, `mkfs.*`, `wipefs`, `blkdiscard`, `fdisk`/`sfdisk`/`cfdisk`/`parted`/`sgdisk`, recursive `chmod -R 777`-style, `chown -R`, `doas`, `pkexec`, and full container-escape detection (privileged, host namespaces, root-fs mount, docker.sock).
  - Added secret-read policies (`.env`, `~/.ssh`, `~/.config/{gh,gcloud,op,sops}`, `~/.gnupg`, `~/*.gpg`, `printenv`) matching pi-guardrails' policies.
  - Added command-substitution scanning: dangerous calls inside `$(...)` or backticks are now caught (mirrors pi-guardrails' AST behavior).
  - Refactored matching to a sliding-window + recursive-substitution scan.
- Added MIT LICENSE.
- Added `test-matchers.mjs` (54 unit tests). Run: `node --experimental-strip-types test-matchers.mjs`.

## 1.1.0

- README: added a detection-category comparison table vs. [`pi-guardrails`](https://github.com/aliou/pi-guardrails).

## 1.0.0

- Initial release.
- Interactive confirmation for dangerous bash commands (deletes, system/privileges, git history/remotes, network/publishing, secrets).
- Write/edit protection: blocks writes outside the project, to secret files (`.env`, `*.pem`, `*.key`), and to protected dirs (`.git/`, `.pi/`).
- Preview of the exact command / unified-diff-style change before each prompt.
- `/ask-when-needed [on|off]` command and `PI_ASK_WHEN_NEEDED` env var to control startup state.
