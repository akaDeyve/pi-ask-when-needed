<p align="center">
  <img src="docs/logo.svg" width="120" alt="ask-when-needed logo">
</p>

<h1 align="center">ask-when-needed</h1>

<p align="center">
  <b>A Pi extension that only asks when it matters.</b><br>
  Deletes · Privileges · Git · Publishing · Secrets
</p>

<p align="center">
  <img alt="Version 0.1.1 alpha" src="https://img.shields.io/badge/version-0.1.1--alpha-orange">
  <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-blueviolet">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><b>English</b> · <a href="README.de.md">Deutsch</a></p>

Pi permission extension: **asks for confirmation only for dangerous actions** and lets everything else run through.

*Read tools, ordinary file edits, builds, and tests run uninterrupted — Pi pauses only when an action could destroy data, change system state, exfiltrate secrets, or publish something.*

> **Alpha:** the detection core works and is covered by tests; expect rough edges and changes.

## What it guards

Interactively prompts (with a preview of the exact command/change) before:

- **Deletes:** `rm -rf` / `rm -r -f`, mass deletion via `find -delete` / `find -exec rm` / `xargs rm`, `shred`, `truncate`, `wipefs`, `diskutil`, `dd`, `mkfs*`
- **System / privileges:** `sudo` (incl. `sudo -E`), `doas`, `su`, `pkexec`, recursive `chmod -R 777`-style / `chown -R`, system-wide package installs, `crontab` / `systemctl` / `launchctl`, `kill` / `killall` / `pkill`
- **Git history / remotes:** `git push` / force-push, `reset --hard`, `clean -f`, `checkout --`, `restore`, `branch -D`, `stash drop` / `clear`, `filter-branch` / `filter-repo`, `rebase`, `--amend`
- **Publishing:** `npm` / `pnpm` / `yarn` / `cargo` publish, `twine upload`, `gem push`, `gh release`
- **Secrets:** reading `.env`, `.dev.vars`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/{gh,gcloud,op,sops}`, `.pem` / `.key` / `.p12` / `.gpg` / `id_rsa` / `id_ed25519` files, database files (`.db`, `.sqlite`, `.sqlite3`, `.mdb`), `printenv` / bare `env` / bare `set`, disguised code (`eval`, `base64 -d | ...`)
- **Container escapes:** `docker`/`podman run|create` with `--privileged`, any `--{pid,network,userns,uts,ipc}=host`, root-fs mount (`-v /:/...`), or docker.sock mount

Write/edit protection:

- asks only for writes to **dangerous system paths** outside the project (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/home/*/.ssh`, `~/.aws`, …; Windows: `C:\Windows`, `C:\System32`, `C:\Users\*\.ssh`, …) — ordinary paths outside the project stay allowed
- asks for writes to **secret files** (`.env`, `*.pem`, `*.key`, …) and **protected dirs** (`.git/`, `.pi/`, including Git hooks and extensions), no matter where they are

Each prompt shows the exact command or a unified-diff-style preview of the change, with three options:

| Option | Effect |
|--------|--------|
| **No** (default, top) | Block the action |
| **Yes, run** | Allow this one action |
| **No, with hint to Pi …** | Block and send the model a hint, e.g. "only delete the build folder" |

"No" is deliberately on top so a stray Enter never approves anything dangerous. In non-interactive mode, dangerous actions are blocked outright.

## Comparison with [`pi-guardrails`](https://github.com/aliou/pi-guardrails)

Both are Pi permission extensions. `ask-when-needed` matches `pi-guardrails`' **permission-gate command detection ~1:1** (same structural matchers for `rm -rf`, privilege escalation, disk/filesystem, recursive permission changes, and container escapes) and **also** covers destructive Git commands, publishing, and secret reads. It adds **command-substitution scanning** (like pi-guardrails' AST parsing) so a dangerous call wrapped in `$(...)` or backticks is still caught.

Pick the one that matches your threat model, or run both.

> The categories below reflect each project's **built-in defaults** (not user-configured custom patterns).

All detections below are **asked** (interactive prompt) by default — a flagged action always pauses for confirmation rather than running silently. ✅ = detected & asked, ❌ = not detected.

| Detection category | `ask-when-needed` | `pi-guardrails` |
|---|:---:|:---:|
| **Technique** | Structural matchers + command-substitution scan + configurable policies | AST structure-parsing + configurable policies |
| `rm -rf` / recursive force delete | ✅ asked | ✅ asked |
| Privilege escalation (`sudo` / `doas` / `su` / `pkexec`) | ✅ asked | ✅ asked (`sudo`, `doas`, `pkexec`; not `su`) |
| Disk / filesystem (`dd of=`, `mkfs*`, `shred`, `wipefs`, `blkdiscard`, `fdisk`/`parted`/`sgdisk`) | ✅ asked | ✅ asked |
| Recursive `chmod` / `chown` | ✅ asked (`chmod -R` **777-style**, `chown -R`) | ✅ asked (`chmod -R` **777-style**, `chown -R`) |
| **Container escape** (`docker run --privileged`, `--*-ns=host`, `-v /:`, socket mounts) | ✅ asked | ✅ asked |
| Mass delete (`find -delete`, `xargs rm`) | ✅ asked | ✅ `rm -rf` only |
| **Destructive Git** (`push`, force-push, `reset --hard`, `clean -f`, `stash drop`, `filter-branch`, `--amend`) | ✅ asked | ❌ not detected |
| **Publishing** (`npm publish`, `cargo publish`, `gh release`, `twine`, `gem`) | ✅ asked | ❌ not detected |
| **Secret reads** (`printenv`/`env`, `.env`, `~/.ssh`, `~/.aws`, `.gnupg`, `.pem`/`.key`) | ✅ asked | ✅ asked (configurable file policies) |
| **Command substitution** (`$(...)` / backtick wrapping) | ✅ asked | ✅ asked |
| **Write outside project** (only dangerous system paths) | ✅ asked (Linux/macOS/Windows system paths; normal paths allowed) | ✅ configurable (ask / block) |
| **Protected file/dir writes** (`.git/`, `.pi/`, secrets) | ✅ asked (built-in) | ✅ configurable |

> Unlike `pi-guardrails`, `ask-when-needed` has **no settings UI and no auto-deny / terminate-by-default** — every detection is surfaced as an **ask** prompt (deny / approve / deny-with-hint), so you stay in control of each action.

**Rule of thumb:**
- Choose **`ask-when-needed`** if your main risks are **destructive Git commands, accidental publishing, and secret exfiltration**.
- Choose **`pi-guardrails`** if you want a **highly configurable** policy engine, AST-based command parsing and a settings UI.
- Run **both** for the widest coverage — they catch largely disjoint sets and do not conflict.

## Install

From GitHub:

```bash
pi install git:github.com/akaDeyve/pi-ask-when-needed@main
```

From a local checkout:

```bash
pi install ./pi-ask-when-needed
```

Or try it once without installing:

```bash
pi -e ./src/index.ts
```

## Usage

- Loaded by default; a footer status shows `🟡 ask when needed`.
- Toggle interactively:

```
/ask-when-needed        " toggle (on/off)
/ask-when-needed on
/ask-when-needed off
```

- Config is reloaded automatically when pi reloads extensions (`/reload`).

- Start disabled by setting an environment variable:

```bash
PI_ASK_WHEN_NEEDED=off pi
```

## Configuration

Optional JSON config file (all fields optional, defaults shown):

**Global:** `~/.pi/agent/extensions/ask-when-needed.json`
**Project:** `.pi/extensions/ask-when-needed.json` (overrides global)

```json
{
  "enabled": true,
  "features": {
    "shell": true,
    "secrets": true,
    "git": true,
    "publish": true,
    "pathPolicies": true
  },
  "dangerousCommands": [
    { "pattern": "terraform destroy", "description": "destroys infrastructure" }
  ],
  "allowedPatterns": [
    { "pattern": "git push --force-with-lease" }
  ],
  "policies": [
    {
      "id": "secret-files",
      "patterns": [".env", "*.pem"],
      "allowedPatterns": [".env.example"],
      "protection": "noAccess",
      "enabled": true
    }
  ],
  "pathAccess": {
    "mode": "ask",
    "dangerousPaths": ["/etc", "/usr", "C:\\Windows"]
  },
  "nonInteractive": "block"
}
```

See [`docs/example-config.json`](docs/example-config.json) for a complete example.

## Development

```bash
npm install
npm test           # detection unit tests (esbuild bundles src/ in memory)
npm run typecheck  # tsc --noEmit
npm run check      # typecheck + tests
```

```
src/
  index.ts            extension entry (commands, prompts, tool hooks)
  detector.ts         checkBash / checkWrite / checkRead
  matcher-utils.ts    shared matching engine (flags, substitution scan)
  matchers-*.ts       shell, git, publish, secrets matchers
  paths.ts            secret files, protected dirs, dangerous system paths
  config.ts           JSON config loading and merging
  preview.ts          command / diff previews for prompts
tests/matchers.mjs    unit tests
docs/                 logo, example config
```

Version: `version` in `package.json` (currently `0.1.1-alpha`); changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT
