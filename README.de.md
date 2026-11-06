<p align="center">
  <img src="docs/logo.svg" width="120" alt="ask-when-needed-Logo">
</p>

<h1 align="center">ask-when-needed</h1>

<p align="center">
  <b>Eine Pi-Extension, die nur fragt, wenn es darauf ankommt.</b><br>
  Löschen · Rechte · Git · Veröffentlichen · Secrets
</p>

<p align="center">
  <img alt="Version 0.1.1 alpha" src="https://img.shields.io/badge/version-0.1.1--alpha-orange">
  <img alt="Pi-Extension" src="https://img.shields.io/badge/pi-extension-blueviolet">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="Lizenz: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Deutsch</b></p>

Pi-Permission-Extension: **fragt nur bei gefährlichen Aktionen nach** und lässt alles andere durch.

*Lese-Tools, normale Datei-Änderungen, Builds und Tests laufen ohne Unterbrechung – Pi hält nur an,
wenn eine Aktion Daten zerstören, den Systemzustand ändern, Secrets abfließen lassen oder etwas
veröffentlichen könnte.*

> **Alpha:** Der Erkennungskern funktioniert und ist durch Tests abgedeckt; mit Ecken und Kanten
> sowie Änderungen ist zu rechnen.

## Was geschützt wird

Interaktive Rückfrage (mit Vorschau des genauen Befehls bzw. der Änderung) vor:

- **Löschen:** `rm -rf` / `rm -r -f`, Massenlöschung per `find -delete` / `find -exec rm` / `xargs rm`, `shred`, `truncate`, `wipefs`, `diskutil`, `dd`, `mkfs*`
- **System / Rechte:** `sudo` (inkl. `sudo -E`), `doas`, `su`, `pkexec`, rekursives `chmod -R 777` o. Ä. / `chown -R`, systemweite Paketinstallationen, `crontab` / `systemctl` / `launchctl`, `kill` / `killall` / `pkill`
- **Git-Historie / Remotes:** `git push` / Force-Push, `reset --hard`, `clean -f`, `checkout --`, `restore`, `branch -D`, `stash drop` / `clear`, `filter-branch` / `filter-repo`, `rebase`, `--amend`
- **Veröffentlichen:** `npm` / `pnpm` / `yarn` / `cargo` publish, `twine upload`, `gem push`, `gh release`
- **Secrets:** Lesen von `.env`, `.dev.vars`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config/{gh,gcloud,op,sops}`, `.pem`- / `.key`- / `.p12`- / `.gpg`- / `id_rsa`- / `id_ed25519`-Dateien, Datenbankdateien (`.db`, `.sqlite`, `.sqlite3`, `.mdb`), `printenv` / nacktes `env` / nacktes `set`, verschleierter Code (`eval`, `base64 -d | ...`)
- **Container-Ausbrüche:** `docker`/`podman run|create` mit `--privileged`, beliebigem `--{pid,network,userns,uts,ipc}=host`, Root-FS-Mount (`-v /:/...`) oder docker.sock-Mount

Schreib-/Edit-Schutz:

- fragt nur bei Schreibzugriffen auf **gefährliche Systempfade** außerhalb des Projekts (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/home/*/.ssh`, `~/.aws`, …; Windows: `C:\Windows`, `C:\System32`, `C:\Users\*\.ssh`, …) – normale Pfade außerhalb des Projekts bleiben erlaubt
- fragt bei Schreibzugriffen auf **Secret-Dateien** (`.env`, `*.pem`, `*.key`, …) und **geschützte Ordner** (`.git/`, `.pi/`, inkl. Git-Hooks und Extensions), egal wo sie liegen

Jede Rückfrage zeigt den genauen Befehl oder eine Vorschau der Änderung im Unified-Diff-Stil, mit drei Optionen:

| Option | Wirkung |
|--------|---------|
| **No** (Standard, oben) | Aktion blockieren |
| **Yes, run** | Diese eine Aktion erlauben |
| **No, with hint to Pi …** | Blockieren und dem Modell einen Hinweis schicken, z. B. „lösche nur den Build-Ordner“ |

„No“ steht absichtlich oben, damit ein versehentliches Enter nie etwas Gefährliches freigibt. Im
nicht-interaktiven Modus werden gefährliche Aktionen direkt blockiert.

## Vergleich mit [`pi-guardrails`](https://github.com/aliou/pi-guardrails)

Beide sind Pi-Permission-Extensions. `ask-when-needed` deckt die **Befehlserkennung des
Permission-Gates von `pi-guardrails` ~1:1** ab (gleiche strukturelle Matcher für `rm -rf`,
Rechteausweitung, Disk/Dateisystem, rekursive Rechteänderungen und Container-Ausbrüche) und
erkennt **zusätzlich** destruktive Git-Befehle, Veröffentlichen und das Lesen von Secrets. Dazu
kommt ein **Command-Substitution-Scan** (wie das AST-Parsing von pi-guardrails), sodass ein
gefährlicher Aufruf in `$(...)` oder Backticks trotzdem erkannt wird.

Nimm die Extension, die zu deinem Bedrohungsmodell passt – oder beide.

> Die Kategorien beziehen sich auf die **eingebauten Standards** beider Projekte (nicht auf
> selbst konfigurierte Muster).

Alle Erkennungen lösen standardmäßig eine **Rückfrage** aus – eine markierte Aktion pausiert immer,
statt still zu laufen. ✅ = erkannt & nachgefragt, ❌ = nicht erkannt.

| Erkennungskategorie | `ask-when-needed` | `pi-guardrails` |
|---|:---:|:---:|
| **Technik** | Strukturelle Matcher + Command-Substitution-Scan + konfigurierbare Policies | AST-Strukturparsing + konfigurierbare Policies |
| `rm -rf` / rekursives Force-Löschen | ✅ | ✅ |
| Rechteausweitung (`sudo` / `doas` / `su` / `pkexec`) | ✅ | ✅ (`sudo`, `doas`, `pkexec`; nicht `su`) |
| Disk / Dateisystem (`dd of=`, `mkfs*`, `shred`, `wipefs`, `blkdiscard`, `fdisk`/`parted`/`sgdisk`) | ✅ | ✅ |
| Rekursives `chmod` / `chown` | ✅ (`chmod -R` **777 o. Ä.**, `chown -R`) | ✅ (`chmod -R` **777 o. Ä.**, `chown -R`) |
| **Container-Ausbruch** (`docker run --privileged`, `--*-ns=host`, `-v /:`, Socket-Mounts) | ✅ | ✅ |
| Massenlöschung (`find -delete`, `xargs rm`) | ✅ | ✅ nur `rm -rf` |
| **Destruktives Git** (`push`, Force-Push, `reset --hard`, `clean -f`, `stash drop`, `filter-branch`, `--amend`) | ✅ | ❌ |
| **Veröffentlichen** (`npm publish`, `cargo publish`, `gh release`, `twine`, `gem`) | ✅ | ❌ |
| **Secrets lesen** (`printenv`/`env`, `.env`, `~/.ssh`, `~/.aws`, `.gnupg`, `.pem`/`.key`) | ✅ | ✅ (konfigurierbare Datei-Policies) |
| **Command Substitution** (`$(...)` / Backticks) | ✅ | ✅ |
| **Schreiben außerhalb des Projekts** (nur gefährliche Systempfade) | ✅ (Systempfade Linux/macOS/Windows; normale Pfade erlaubt) | ✅ konfigurierbar (ask / block) |
| **Geschützte Dateien/Ordner** (`.git/`, `.pi/`, Secrets) | ✅ (eingebaut) | ✅ konfigurierbar |

> Anders als `pi-guardrails` hat `ask-when-needed` **keine Settings-UI und kein automatisches
> Ablehnen/Beenden** – jede Erkennung wird als **Rückfrage** angezeigt (ablehnen / erlauben /
> ablehnen mit Hinweis), du behältst also bei jeder Aktion die Kontrolle.

**Faustregel:**
- **`ask-when-needed`**, wenn deine Hauptrisiken **destruktive Git-Befehle, versehentliches Veröffentlichen und abfließende Secrets** sind.
- **`pi-guardrails`**, wenn du eine **stark konfigurierbare** Policy-Engine, AST-basiertes Befehlsparsing und eine Settings-UI willst.
- **Beide**, für die breiteste Abdeckung – sie kommen sich nicht in die Quere.

## Installation

Von GitHub:

```bash
pi install git:github.com/akaDeyve/pi-ask-when-needed@main
```

Aus einem lokalen Checkout:

```bash
pi install ./pi-ask-when-needed
```

Oder einmalig ohne Installation ausprobieren:

```bash
pi -e ./src/index.ts
```

## Benutzung

- Standardmäßig aktiv; in der Fußzeile steht `🟡 ask when needed`.
- Interaktiv umschalten:

```
/ask-when-needed        " umschalten (an/aus)
/ask-when-needed on
/ask-when-needed off
```

- Die Konfiguration wird automatisch neu geladen, wenn Pi die Extensions neu lädt (`/reload`).

- Deaktiviert starten per Umgebungsvariable:

```bash
PI_ASK_WHEN_NEEDED=off pi
```

## Konfiguration

Optionale JSON-Konfigurationsdatei (alle Felder optional):

**Global:** `~/.pi/agent/extensions/ask-when-needed.json`
**Projekt:** `.pi/extensions/ask-when-needed.json` (überschreibt global)

Ein vollständiges Beispiel mit allen Feldern steht in
[`docs/example-config.json`](docs/example-config.json); die Felder sind in der
[englischen README](README.md#configuration) beschrieben.

## Entwicklung

```bash
npm install
npm test           # Unit-Tests der Erkennung (esbuild bündelt src/ im Speicher)
npm run typecheck  # tsc --noEmit
npm run check      # Typecheck + Tests
```

```
src/
  index.ts            Einstiegspunkt (Befehle, Rückfragen, Tool-Hooks)
  detector.ts         checkBash / checkWrite / checkRead
  matcher-utils.ts    gemeinsame Matching-Engine (Flags, Substitution-Scan)
  matchers-*.ts       Matcher für Shell, Git, Publish, Secrets
  paths.ts            Secret-Dateien, geschützte Ordner, gefährliche Systempfade
  config.ts           Laden und Zusammenführen der JSON-Konfiguration
  preview.ts          Befehls-/Diff-Vorschau für Rückfragen
tests/matchers.mjs    Unit-Tests
docs/                 Logo, Beispielkonfiguration
```

Version: `version` in `package.json` (aktuell `0.1.1-alpha`); Änderungen stehen in
[CHANGELOG.md](CHANGELOG.md).

## Lizenz

MIT
