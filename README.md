<p align="center">
  <img src="docs/logo.svg" width="120" alt="ask-when-needed logo">
</p>

<h1 align="center">ask-when-needed</h1>

<p align="center">
  <b>A Pi extension that only asks when it matters.</b><br>
  Deletes · Privileges · Git · Publishing · Secrets
</p>

<p align="center">
  <img alt="Version 0.2.0 alpha" src="https://img.shields.io/badge/version-0.2.0--alpha-orange">
  <img alt="Pi extension" src="https://img.shields.io/badge/pi-extension-blueviolet">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><b>English</b> · <a href="README.de.md">Deutsch</a></p>

Pi permission extension: **asks for confirmation only for dangerous actions** and lets everything else run through. In [classifier mode](#classifier-mode) a model takes that decision for you.

*Read tools, ordinary file edits, builds, and tests run uninterrupted — Pi pauses only when an action could destroy data, change system state, exfiltrate secrets, or publish something.*

> **Alpha:** the detection core works; expect rough edges and changes.

## What it guards

Pauses (with a preview of the exact command/change) before:

- **Deletes:** recursive `rm` (`rm -r`, `rm -rf`, `rm --recursive`), mass deletion via `find -delete` / `find -exec rm` / `xargs rm`, `shred`, `truncate`, `wipefs`, `diskutil`, `dd`, `mkfs*`
- **System / privileges:** `sudo` (incl. `sudo -E`), `doas`, `su`, `pkexec`, recursive `chmod -R 777`-style / `chown -R`, `crontab` / `systemctl` / `launchctl`, `kill` / `killall` / `pkill`
- **Git history / remotes:** `git push` / force-push, `reset --hard`, `clean -f`, `checkout --` / `checkout .` / `checkout -f`, `restore` (except `--staged`), `rm -f`, `branch -D`, `stash drop` / `clear`, `filter-branch` / `filter-repo`, `rebase`, `--amend`
- **Publishing:** `npm` / `pnpm` / `yarn` / `cargo` publish, `twine upload`, `gem push`, `gh release`
- **Secrets:** secret files, whether read through a tool or named in a shell command or a `grep` glob (`cat .env*`, `--key=server.pem`, `-v ~/.aws:/creds`): `.env` / `.env.*` (not `.env.example`), `.dev.vars`, `.netrc`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, `~/.docker`, `~/.config/{gh,gcloud,op,sops}`, `.pem` / `.key` / `.p12` / `.gpg` / `id_rsa` / `id_ed25519` / `id_ecdsa` files, `*credentials*`, database files (`.db`, `.sqlite`, `.sqlite3`, `.mdb`); also `printenv` / bare `env` / bare `set` and disguised code (`eval`, `base64 -d`)
- **Container escapes:** `docker`/`podman run|create` with `--privileged`, a host namespace (`--pid`, `--network`, `--userns`, `--uts`, `--ipc`), root-fs mount (`-v /:/...`), or docker.sock mount
- **PowerShell** (the `powershell` tool): recursive `Remove-Item` and its aliases, `Stop-Process`, `Invoke-Expression` / `iex`, `Start-Process -Verb RunAs`, services and scheduled tasks, `Format-Volume` / `Clear-Disk`, `Get-ChildItem Env:`; paths may use `\`

A dangerous command is found wherever it hides: behind `env`, `time` or `xargs`, inside `bash -c "…"`, `$(…)`, backticks, subshells and pipes, with a path (`/bin/rm`) or in quotes (`'r'm`) – and with its flags behind a nested argument (`docker run -v $(pwd):/app --privileged`).

The message of a `git` / `gh` command (`-m "…"`, `--title`, `--body`) is text, not a command: `git commit -m "fix: kill zombie worker"` runs without a prompt. Likewise `git rm -r`, because Git keeps what it removes.

Write/edit protection:

- asks only for writes to **dangerous system paths** outside the project (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/var`, `~/.config`, …; Windows: `C:\Windows`, `System32`, …) — ordinary paths outside the project stay allowed
- asks for writes to **secret files** (`.env`, `*.pem`, `*.key`, …) and **protected dirs** (`.git/`, `.pi/`, including Git hooks and extensions), no matter where they are

Each prompt shows the exact command or a unified-diff-style preview of the change, with three options:

| Option | Effect |
|--------|--------|
| **No** (default, top) | Block the action |
| **Yes, run it** | Allow this one action |
| **No, with a hint to Pi ...** | Block and send the model a hint, e.g. "only delete the build folder" |

"No" is deliberately on top so a stray Enter never approves anything dangerous. Without a UI to ask (`pi -p`), dangerous actions are blocked outright.

## Modes

| Mode | Who decides about a flagged action |
|------|------------------------------------|
| `ask` (default) | You, in the prompt above |
| `classifier` | A model. It lets the action run or blocks it; you are only asked after repeated blocks or if the model is unavailable |

### Classifier mode

```
/ask-when-needed classifier
```

It works like [Claude Code's auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode), applied to the actions the rules above flag:

- **What the model sees:** your messages and the agent's tool calls (the last 5 and 20), the flagged action and why it was flagged. It never sees the agent's own words or any tool output: it judges what the agent does, not what it says, and text injected through a file or a web page cannot reach it.
- **Two stages:** a fast yes/no that blocks when in doubt, then – only if that says block – the same question again with step-by-step reasoning. Most flagged actions cost one short request.
- **How it judges:** an action is blocked if it would destroy or exfiltrate data, weaken security, cross a trust boundary, or bypass review or affect others – unless an exception applies (rebuildable build output, pushing the session's own branch, standard credential flows, processes the agent started itself) or you asked for exactly that. What the agent chose on its own is not authorised, and a flag that is a false alarm passes. `classifier.environment`, `block` and `allow` adapt the rules to your setup.
- **On a block** the agent gets the reason, is told to find a safer way instead of working around it, and carries on. After 3 blocks in a row or 20 in a session you get the normal prompt; without a UI (`pi -p`) the run ends. If the model fails you are asked, too. Every verdict is shown, e.g. `🤖 claude-haiku-5-5 blocked: the user did not ask to delete it`.
- **Which model:** `classifier.model` as `provider/id` – any chat model, ideally a small, fast one. Default: the session's model.
- **Unlike auto mode,** only flagged actions reach the model. Everything else passes through untouched, exactly as in ask mode.

## Comparison with [`pi-guardrails`](https://github.com/aliou/pi-guardrails)

Both are Pi permission extensions. `ask-when-needed` matches `pi-guardrails`' **permission-gate command detection ~1:1** (same structural matchers for `rm -rf`, privilege escalation, disk/filesystem, recursive permission changes, and container escapes) and **also** covers destructive Git commands, publishing, and secret reads. It adds **command-substitution scanning** (like pi-guardrails' AST parsing) so a dangerous call wrapped in `$(...)` or backticks is still caught.

Pick the one that matches your threat model, or run both.

> The categories below reflect each project's **built-in defaults** (not user-configured custom patterns).

All detections below are **asked** (interactive prompt) by default — a flagged action always pauses for confirmation rather than running silently. ✅ = detected & asked, ❌ = not detected.

| Detection category | `ask-when-needed` | `pi-guardrails` |
|---|:---:|:---:|
| **Technique** | Structural matchers + command-substitution scan + configurable policies | AST structure-parsing + configurable policies |
| Recursive delete (`rm -r`, `rm -rf`) | ✅ asked | ✅ asked (`rm -rf` only) |
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
| **Protected file/dir writes** (`.git/`, `.pi/`, secrets) | ✅ asked (configurable policies) | ✅ configurable |

> Unlike `pi-guardrails`, `ask-when-needed` has **no settings UI and no auto-deny / terminate-by-default** — out of the box every detection is surfaced as an **ask** prompt (deny / approve / deny-with-hint), so you stay in control of each action. Handing those decisions to a model (classifier mode) or blocking paths outright (`pathAccess`) is opt-in.

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

- Loaded by default; a footer status shows `🟡 ask when needed` (plus the mode, if it is not `ask`).
- Switch interactively:

```
/ask-when-needed              toggle on/off
/ask-when-needed on | off
/ask-when-needed ask          you decide (default)
/ask-when-needed classifier   a model decides
```

- Config is reloaded automatically when pi reloads extensions (`/reload`).

- Choose the start state with an environment variable (`off`, `ask` or `classifier`; a mode switches on even if the config says `"enabled": false`):

```bash
PI_ASK_WHEN_NEEDED=off pi
PI_ASK_WHEN_NEEDED=classifier pi -p "tidy up the repo"
```

## Configuration

Optional JSON config file; every field is optional.

**Global:** `~/.pi/agent/extensions/ask-when-needed.json`
**Project:** `.pi/extensions/ask-when-needed.json` (overrides global; only read in projects you trust)

Lists **add** to the built-in rules, everything else overrides them. Protection is only removed where a config says so explicitly (`enabled`, `features`, `allowedPatterns`, a policy's `enabled` / `allowedPatterns`, `pathAccess.mode`, `nonInteractive`).

```json
{
  "mode": "classifier",
  "classifier": {
    "model": "claude-code/claude-haiku-5-5",
    "environment": "Trusted: the project directory, its git repository and github.com/acme.",
    "block": ["touch the production database"],
    "allow": ["dropping the local test database"]
  },
  "features": { "publish": false },
  "dangerousCommands": [
    { "pattern": "terraform destroy", "description": "destroys infrastructure" }
  ],
  "allowedPatterns": [
    { "pattern": "git push --force-with-lease" },
    { "pattern": "^rm -rf (dist|build)$", "regex": true }
  ],
  "policies": [
    { "id": "secret-files", "patterns": ["*.tfstate"], "allowedPatterns": ["*.db"] },
    { "id": "migrations", "patterns": ["db/migrations"], "protection": "readOnly", "description": "applied migrations" }
  ],
  "pathAccess": { "mode": "ask", "dangerousPaths": ["/opt/prod", "~/vault"] },
  "nonInteractive": "block"
}
```

| Field | Default | Meaning |
|-------|---------|---------|
| `enabled` | `true` | Master switch |
| `mode` | `"ask"` | `ask` or `classifier`, see [Modes](#modes) |
| `classifier.model` | session's model | `provider/id` of a chat model |
| `classifier.environment` | project directory and its git repository | What the classifier trusts; everything else counts as external |
| `classifier.block` / `classifier.allow` | built-in rules | More block rules and exceptions, in plain language (added to the built-in ones) |
| `features` | all `true` | Switch off a category: `shell`, `secrets`, `git`, `publish`, `powershell`, `pathPolicies` |
| `dangerousCommands` | `[]` | More commands to flag. `pattern` is a substring, or a regular expression with `"regex": true` |
| `allowedPatterns` | `[]` | Commands that are never flagged. `pattern` is the start of the command, or a regular expression |
| `policies` | `secret-files`, `protected-dirs` | Protected paths (globs). `noAccess` guards reading and writing, `readOnly` writing. Reuse a built-in `id` to add `patterns`, add exceptions (`allowedPatterns`) or switch it off (`"enabled": false`) |
| `pathAccess` | `"mode": "ask"` | Writes outside the project to `dangerousPaths` (globs, added to the built-in list): `ask`, `allow`, or `block` without asking |
| `nonInteractive` | `"block"` | Without a UI: `block` dangerous actions or `allow` them |

Command patterns are checked per simple command (the parts between `;`, `&&`, `|`, …) with quotes removed, so allowing `git push --force-with-lease` does not allow `git push --force-with-lease && rm -rf ~`.
Globs match at any depth (`*.pem`, `.ssh` and everything below it); a leading `/` or `~` pins them to that location, and `*` never crosses a `/`.

See [`docs/example-config.json`](docs/example-config.json) for a complete example.

## Development

```bash
npm install
npm run typecheck  # tsc --noEmit
```

```
src/
  index.ts               extension entry: status, command, tool hook, modes
  config.ts              config schema, defaults (all rule data), loading
  detector.ts            compiles the config into one check for shell/read/write calls
  matcher-utils.ts       engine: splits commands, slides the matchers over them
  matchers-*.ts          command matchers per category: shell, git, publish, secrets, powershell
  paths.ts               path resolution, glob matching
  preview.ts             command / diff previews for prompts
  decider.ts             decider contract
  decider-ask.ts         ask mode: interactive prompt
  decider-classifier.ts  classifier mode: a model decides
docs/                    logo, example config
```

Every tool call runs through two swappable stages — **detect** (what is dangerous?) and **decide** (who decides?):

- a new detection category is one `matchers-*.ts` module plus one line in `CATEGORIES` (`detector.ts`)
- a new mode is one `decider-*.ts` module plus one line in `MODES` (`index.ts`)
- new commands and path rules need no code, only config

Version: `version` in `package.json` (currently `0.2.0-alpha`); changes are listed in
[CHANGELOG.md](CHANGELOG.md).

## License

MIT
