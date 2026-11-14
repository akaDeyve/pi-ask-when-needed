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
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><b>English</b> · <a href="README.de.md">Deutsch</a></p>

A Pi permission extension that **only asks before dangerous actions**. Ordinary reads, file edits, builds and tests run uninterrupted. Pi pauses only when an action could destroy data, change system state, leak secrets or publish something. In [classifier mode](#classifier-mode), a model makes that call instead of you.

> **Alpha:** expect rough edges and changes.

## What it guards

Pi pauses before these and shows the exact command or change:

- **Deletes:** recursive `rm`, `find -delete`, `xargs rm`, `shred`, `dd`, `mkfs*`
- **System & privileges:** `sudo`, `doas`, `su`, `pkexec`, recursive `chmod -R 777` / `chown -R`, `crontab`, `systemctl`, `launchctl`, `kill`
- **Git:** `git push` (incl. force-push), `reset --hard`, `clean -f`, `checkout --`, `rebase`, `--amend`, `branch -D`, `stash drop`, `filter-repo`
- **Publishing:** `npm` / `pnpm` / `yarn` / `cargo publish`, `twine upload`, `gem push`, `gh release`
- **Secrets:** files such as `.env`, `*.pem`, `*.key`, `id_rsa` or `*credentials*`; `~/.ssh`, `~/.aws` and other credential folders; `printenv` and bare `env`
- **Containers:** `docker` / `podman run` with `--privileged`, host namespaces (`--pid`, `--network`, …), root-filesystem or `docker.sock` mounts
- **PowerShell** (`powershell` tool): recursive `Remove-Item`, `Stop-Process`, `iex`, `Start-Process -Verb RunAs`, `Format-Volume`

Commands are caught even when hidden: behind `env`, `xargs` or `time`, inside `bash -c`, `$(…)`, backticks or pipes, or with a full path (`/bin/rm`) or quotes (`'r'm`). Secret files are guarded whether a tool reads them or a shell command names them.

Writes are asked about too: to dangerous system paths outside the project (`/etc`, `/usr`, `C:\Windows`, …), and to secret files or protected directories (`.git/`, `.pi/`) anywhere. Other paths outside the project stay allowed.

Messages of `git` / `gh` commands (`-m`, `--title`, `--body`) are text, not commands: `git commit -m "fix: kill zombie worker"` runs without a prompt. So does `git rm -r`, because Git keeps what it removes.

Each prompt offers three options:

| Option | Effect |
|--------|--------|
| **No** (default, top) | Block the action |
| **Yes, run it** | Allow this one action |
| **No, with a hint to Pi ...** | Block and send Pi a hint, e.g. "only delete the build folder" |

"No" is on top on purpose, so a stray Enter approves nothing dangerous. Without a UI (`pi -p`), dangerous actions are blocked.

## Modes

| Mode | Who decides |
|------|-------------|
| `ask` (default) | You, in the prompt |
| `classifier` | A model. You are asked only after repeated blocks or if the model is unavailable |

### Classifier mode

Enable with `/ask-when-needed classifier`. It works like [Claude Code's auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode), applied to flagged actions:

- **What the model sees:** your last 5 messages, the agent's last 20 tool calls, and the flagged action with its reason. Never the agent's own text or any tool output, so injected text in a file or web page cannot reach it.
- **Two steps:** a quick yes/no that blocks when in doubt. Only if that says *block* is the same question asked again with step-by-step reasoning. Most flagged actions cost one short request.
- **Judgment:** blocks actions that would destroy or leak data, weaken security, cross a trust boundary or bypass review, unless an exception applies (e.g. rebuildable build output, pushing the session's own branch) or you asked for exactly that. Actions the agent chose on its own are not authorised.
- **On a block,** the agent gets the reason and looks for a safer way. After 3 blocks in a row or 20 in a session, you are asked; without a UI the run ends. Every verdict is shown.
- **Setup:** `classifier.model` (`provider/id`, ideally a small, fast chat model; default: the session's model). `classifier.environment`, `block` and `allow` adapt the rules to your setup.

## Comparison with [pi-guardrails](https://github.com/aliou/pi-guardrails)

Both are Pi permission extensions and cover much of the same ground (`rm -rf`, `sudo`, disk tools, recursive `chmod`/`chown`, container escapes, secret files).

- **ask-when-needed** also detects destructive Git commands and publishing, which pi-guardrails does not. By default, every detection asks you.
- **pi-guardrails** has a settings UI, AST-based command parsing and a more configurable policy engine.

Choose by your main risks, or run both for the widest coverage – they don't conflict.

## Install

```bash
# from GitHub
pi install git:github.com/akaDeyve/pi-ask-when-needed@main

# from a local checkout
pi install ./pi-ask-when-needed

# try it once, without installing
pi -e ./src/index.ts
```

## Usage

Enabled by default; the footer shows `🟡 ask when needed` (plus the mode if it isn't `ask`).

```
/ask-when-needed              toggle on/off
/ask-when-needed on | off
/ask-when-needed ask          you decide (default)
/ask-when-needed classifier   a model decides
```

Set the start state with `PI_ASK_WHEN_NEEDED` (`off`, `ask` or `classifier`):

```bash
PI_ASK_WHEN_NEEDED=off pi
PI_ASK_WHEN_NEEDED=classifier pi -p "tidy up the repo"
```

Config is reloaded when Pi reloads extensions (`/reload`).

## Configuration

Optional JSON file; every field is optional. The project file overrides the global one.

- **Global:** `~/.pi/agent/extensions/ask-when-needed.json`
- **Project:** `.pi/extensions/ask-when-needed.json` (only read in projects you trust)

```json
{
  "mode": "classifier",
  "dangerousCommands": [
    { "pattern": "terraform destroy", "description": "destroys infrastructure" }
  ],
  "allowedPatterns": [
    { "pattern": "git push --force-with-lease" }
  ]
}
```

Lists add to the built-in rules; everything else overrides them. Protection is only lowered where you say so explicitly.

| Field | Default | Meaning |
|-------|---------|---------|
| `enabled` | `true` | Master switch |
| `mode` | `"ask"` | `ask` or `classifier` |
| `classifier.model` | session's model | Chat model as `provider/id` |
| `classifier.environment` | project and its git repo | What counts as trusted; everything else is external |
| `classifier.block` / `allow` | built-in rules | Extra block rules and exceptions, in plain language |
| `features` | all `true` | Switch off categories: `shell`, `secrets`, `git`, `publish`, `powershell`, `pathPolicies` |
| `dangerousCommands` | `[]` | Extra commands to flag: a substring, or a regex with `"regex": true` |
| `allowedPatterns` | `[]` | Commands never to flag: the start of the command, or a regex |
| `policies` | `secret-files`, `protected-dirs` | Protected paths (globs). `noAccess` blocks reads and writes, `readOnly` only writes. Reuse a built-in `id` to extend it, or set `"enabled": false` |
| `pathAccess` | `"mode": "ask"` | Writes outside the project to `dangerousPaths` (globs): `ask`, `allow` or `block` |
| `nonInteractive` | `"block"` | Without a UI: `block` or `allow` dangerous actions |

Command patterns are checked per simple command (the parts between `;`, `&&`, `|`, …), so allowing `git push --force-with-lease` does not also allow `git push --force-with-lease && rm -rf ~`. Globs match at any depth; a leading `/` or `~` anchors them to that location.

Full example: [`docs/example-config.json`](docs/example-config.json).

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
```

Every tool call passes through two swappable stages: **detect** (what is dangerous? `detector.ts`, `matchers-*.ts`) and **decide** (who decides? `decider-*.ts`).

- New detection category: one `matchers-*.ts` module plus one line in `CATEGORIES` (`detector.ts`).
- New mode: one `decider-*.ts` module plus one line in `MODES` (`index.ts`).
- New commands and path rules need only config. Defaults live in `config.ts`.

Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## License

MIT
