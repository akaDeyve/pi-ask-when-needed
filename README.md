# ask-when-needed

Pi permission extension: **asks for confirmation only for dangerous actions** and lets everything else run through.

*Read tools, ordinary file edits, builds, and tests run uninterrupted — Pi pauses only when an action could destroy data, change system state, exfiltrate secrets, or publish something.*

## What it guards

Interactively prompts (with a preview of the exact command/change) before:

- **Deletes:** `rm -rf`, mass deletion via `find -delete` / `xargs rm`, `shred`, `dd`, `mkfs*`
- **System / privileges:** `sudo`, `doas`, `su`, recursive `chmod`/`chown`, package installs that affect the system, `crontab` / `systemctl` / `launchctl`, `kill*`/`pkill`
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

## Install

From npm (after publishing):

```bash
pi install npm:pi-ask-when-needed
```

From git:

```bash
pi install git:github.com/<you>/pi-ask-when-needed@main
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
