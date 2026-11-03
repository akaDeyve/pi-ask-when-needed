# Changelog

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
