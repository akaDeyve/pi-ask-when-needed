# ask-when-needed

Pi permission extension: **asks for confirmation only for dangerous actions** and lets everything else run through.

*Read tools, ordinary file edits, builds, and tests run uninterrupted — Pi pauses only when an action could destroy data, change system state, exfiltrate secrets, or publish something.*

## What it guards

Interactively prompts (with a preview of the exact command/change) before:

- **Deletes:** `rm -rf`, mass deletion via `find -delete` / `xargs rm`, `shred`, `dd`, `mkfs*`
- **System / privileges:** `sudo`, `doas`, `su`, recursive `chmod`/`chown`, system-wide package installs, `crontab` / `systemctl` / `launchctl`, `kill*`/`pkill`
- **Git history / remotes:** `git push`, force-push, `reset --hard`, `clean -f`, `branch -D`, `stash drop/clear`, `filter-branch` / `filter-repo`, `--amend`
- **Network / publishing:** `curl | sh`, uploads (`curl -d/-F/-T`), `nc`/`socat`, `ssh`/`scp`/`rsync`, `npm publish` / `cargo publish` / `gh release`
- **Secrets:** reading `.env`, `~/.ssh`, `~/.aws`, `.pem`/`.key` files, `printenv`, disguised code (`eval`, `base64 -d | ...`)

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

Both are Pi permission extensions, but they detect **different things** with different techniques. They are **complementary** — pick the one that matches your threat model, or run both.

> The categories below reflect each project's **built-in defaults** (not user-configured custom patterns).

| Detection category | `ask-when-needed` | `pi-guardrails` |
|---|:---:|:---:|
| **Technique** | Regex on the raw command string | AST structure-parsing + configurable policies |
| `rm -rf` / recursive force delete | ✅ | ✅ |
| Privilege escalation (`sudo` / `doas` / `su`) | ✅ `sudo`, `doas`, `su` | ✅ `sudo`, `doas`, `pkexec` (not `su`) |
| Disk / filesystem (`dd`, `mkfs*`, `shred`, `wipefs`) | ✅ | ✅ (+ `blkdiscard`, `fdisk`, `parted`, `sfdisk`…) |
| Recursive `chmod` / `chown` | ✅ any recursive | ✅ `chmod -R` **777-style** & `chown -R` only |
| **Container escape** (`docker run --privileged`, `-v /:`, socket mounts) | ✅ partial (`--privileged`, `-v /:`) | ✅ comprehensive (all namespace/sock mounts) |
| **Destructive Git** (`push`, force-push, `reset --hard`, `clean -f`, `stash drop`, `filter-branch`, `--amend`) | ✅ | ❌ none |
| **Publishing** (`npm publish`, `cargo publish`, `gh release`, `twine`, `gem`) | ✅ | ❌ none |
| **Network / exfiltration** (`curl -d/-F/-T`, `ssh`/`scp`/`rsync`, `nc`/`socat`) | ✅ | ❌ none |
| **Secret reads** (`printenv`/`env`, `.env`, `~/.ssh`, `~/.aws`, `.pem`/`.key`) | ✅ | ✅ via configurable file policies |
| **Command substitution** (`$(...)` wrapping) | ❌ not parsed | ✅ catches risky calls inside `$(...)` |
| Mass delete (`find -delete`, `xargs rm`) | ✅ | ✅ `rm -rf` only |
| `git push --force` | ✅ | ❌ |
| **Write outside project** | ✅ blocked | ✅ configurable ask/block |
| **Protected file/dir writes** (`.git/`, `.pi/`, secrets) | ✅ built-in | ✅ configurable |

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
