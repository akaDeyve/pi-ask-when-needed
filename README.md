# ask-when-needed

Pi permission extension: **asks for confirmation only for dangerous actions** and lets everything else run through.

*Read tools, ordinary file edits, builds, and tests run uninterrupted — Pi pauses only when an action could destroy data, change system state, exfiltrate secrets, or publish something.*

## What it guards

Interactively prompts (with a preview of the exact command/change) before:

- **Deletes:** `rm -rf` / `rm -r -f`, mass deletion via `find -delete` / `find -exec rm` / `xargs rm`, `shred`, `truncate`, `wipefs`, `diskutil`, `dd`, `mkfs*`
- **System / privileges:** `sudo` (incl. `sudo -E`), `doas`, `su`, `pkexec`, recursive `chmod -R 777`-style / `chown -R`, system-wide package installs, `crontab` / `systemctl` / `launchctl`, `kill` / `killall` / `pkill`
- **Git history / remotes:** `git push` / force-push, `reset --hard`, `clean -f`, `checkout --`, `restore`, `branch -D`, `stash drop` / `clear`, `filter-branch` / `filter-repo`, `rebase`, `--amend`
- **Network / publishing:** `curl | sh` (pipe-to-shell), uploads (`curl -d/-F/-T`, `wget`), `nc` / `ncat` / `netcat` / `socat`, `ssh` / `scp` / `sftp` / `rsync`, `npm` / `pnpm` / `yarn` / `cargo` publish, `twine upload`, `gem push`, `gh release`
- **Secrets:** reading `.env`, `.dev.vars`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/{gh,gcloud,op,sops}`, `.pem` / `.key` / `.p12` / `.gpg` / `id_rsa` / `id_ed25519` files, `printenv` / bare `env` / bare `set`, disguised code (`eval`, `base64 -d | ...`)
- **Container escapes:** `docker`/`podman run|create` with `--privileged`, any `--{pid,network,userns,uts,ipc}=host`, root-fs mount (`-v /:/...`), or docker.sock mount

Write/edit protection:

- blocks writes **outside the project**
- blocks writes to **secret files** (`.env`, `*.pem`, `*.key`, …) and **protected dirs** (`.git/`, `.pi/`, including Git hooks and extensions)

Each prompt shows the exact command or a unified-diff-style preview of the change, with three options:

| Option | Effect |
|--------|--------|
| **Nein** (default, top) | Block the action |
| **Ja, ausführen** | Allow this one action |
| **Nein, mit Hinweis an Pi …** | Block and send the model a hint, e.g. "only delete the build folder" |

"Nein" is deliberately on top so a stray Enter never approves anything dangerous. In non-interactive mode, dangerous actions are blocked outright.

## Comparison with [`pi-guardrails`](https://github.com/aliou/pi-guardrails)

Both are Pi permission extensions. `ask-when-needed` matches `pi-guardrails`' **permission-gate command detection ~1:1** (same structural matchers for `rm -rf`, privilege escalation, disk/filesystem, recursive permission changes, and container escapes) and **also** covers destructive Git commands, publishing, network/exfiltration, and secret reads. It adds **command-substitution scanning** (like pi-guardrails' AST parsing) so a dangerous call wrapped in `$(...)` or backticks is still caught.

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
| **Network / exfiltration** (`curl -d/-F/-T`, `ssh`/`scp`/`rsync`, `nc`/`socat`) | ✅ asked | ❌ not detected |
| **Secret reads** (`printenv`/`env`, `.env`, `~/.ssh`, `~/.aws`, `.gnupg`, `.pem`/`.key`) | ✅ asked | ✅ asked (configurable file policies) |
| **Command substitution** (`$(...)` / backtick wrapping) | ✅ asked | ✅ asked |
| **Write outside project** | ✅ asked | ✅ configurable (ask / block) |
| **Protected file/dir writes** (`.git/`, `.pi/`, secrets) | ✅ asked (built-in) | ✅ configurable |

> Unlike `pi-guardrails`, `ask-when-needed` has **no settings UI and no auto-deny / terminate-by-default** — every detection is surfaced as an **ask** prompt (deny / approve / deny-with-hint), so you stay in control of each action.

**Rule of thumb:**
- Choose **`ask-when-needed`** if your main risks are **destructive Git commands, accidental publishing, and secret exfiltration**.
- Choose **`pi-guardrails`** if you want a **highly configurable** policy engine, AST-based command parsing (harder to bypass via command substitution), container-escape detection, and a settings UI.
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
pi -e ./extensions/ask-when-needed.ts
```

## Usage

- Loaded by default; a footer status shows `🟡 ask when needed`.
- Toggle interactively:

```
/ask-when-needed        " umschalten (on/off)
/ask-when-needed on
/ask-when-needed off
```

- Start disabled by setting an environment variable:

```bash
PI_ASK_WHEN_NEEDED=off pi
```

## License

MIT
