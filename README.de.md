<p align="center">
  <img src="docs/logo.svg" width="120" alt="ask-when-needed-Logo">
</p>

<h1 align="center">ask-when-needed</h1>

<p align="center">
  <b>Eine Pi-Extension, die nur fragt, wenn es darauf ankommt.</b><br>
  Löschen · Rechte · Git · Veröffentlichen · Secrets
</p>

<p align="center">
  <img alt="Version 0.2.0 alpha" src="https://img.shields.io/badge/version-0.2.0--alpha-orange">
  <img alt="Pi-Extension" src="https://img.shields.io/badge/pi-extension-blueviolet">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white">
  <a href="LICENSE"><img alt="Lizenz: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Deutsch</b></p>

Pi-Permission-Extension: **fragt nur bei gefährlichen Aktionen nach** und lässt alles andere durch.
Im [Classifier-Modus](#classifier-modus) übernimmt ein Modell diese Entscheidung für dich.

*Lese-Tools, normale Datei-Änderungen, Builds und Tests laufen ohne Unterbrechung – Pi hält nur an,
wenn eine Aktion Daten zerstören, den Systemzustand ändern, Secrets abfließen lassen oder etwas
veröffentlichen könnte.*

> **Alpha:** Der Erkennungskern funktioniert; mit Ecken und Kanten sowie Änderungen ist zu rechnen.

## Was geschützt wird

Hält an (mit Vorschau des genauen Befehls bzw. der Änderung) vor:

- **Löschen:** rekursives `rm` (`rm -r`, `rm -rf`, `rm --recursive`), Massenlöschung per `find -delete` / `find -exec rm` / `xargs rm`, `shred`, `truncate`, `wipefs`, `diskutil`, `dd`, `mkfs*`
- **System / Rechte:** `sudo` (inkl. `sudo -E`), `doas`, `su`, `pkexec`, rekursives `chmod -R 777` o. Ä. / `chown -R`, `crontab` / `systemctl` / `launchctl`, `kill` / `killall` / `pkill`
- **Git-Historie / Remotes:** `git push` / Force-Push, `reset --hard`, `clean -f`, `checkout --` / `checkout .` / `checkout -f`, `restore` (außer `--staged`), `rm -f`, `branch -D`, `stash drop` / `clear`, `filter-branch` / `filter-repo`, `rebase`, `--amend`
- **Veröffentlichen:** `npm` / `pnpm` / `yarn` / `cargo` publish, `twine upload`, `gem push`, `gh release`
- **Secrets:** Secret-Dateien – egal ob per Tool gelesen oder in einem Shell-Befehl oder `grep`-Glob genannt (`cat .env*`, `--key=server.pem`, `-v ~/.aws:/creds`): `.env` / `.env.*` (nicht `.env.example`), `.dev.vars`, `.netrc`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, `~/.docker`, `~/.config/{gh,gcloud,op,sops}`, `.pem`- / `.key`- / `.p12`- / `.gpg`- / `id_rsa`- / `id_ed25519`- / `id_ecdsa`-Dateien, `*credentials*`, Datenbankdateien (`.db`, `.sqlite`, `.sqlite3`, `.mdb`); außerdem `printenv` / nacktes `env` / nacktes `set` und verschleierter Code (`eval`, `base64 -d`)
- **Container-Ausbrüche:** `docker`/`podman run|create` mit `--privileged`, einem Host-Namespace (`--pid`, `--network`, `--userns`, `--uts`, `--ipc`), Root-FS-Mount (`-v /:/...`) oder docker.sock-Mount
- **PowerShell** (das `powershell`-Tool): rekursives `Remove-Item` samt Aliasen, `Stop-Process`, `Invoke-Expression` / `iex`, `Start-Process -Verb RunAs`, Dienste und geplante Aufgaben, `Format-Volume` / `Clear-Disk`, `Get-ChildItem Env:`; Pfade dürfen `\` enthalten

Ein gefährlicher Befehl wird gefunden, egal wo er steckt: hinter `env`, `time` oder `xargs`, in
`bash -c "…"`, `$(…)`, Backticks, Subshells und Pipes, mit Pfad (`/bin/rm`) oder in
Anführungszeichen (`'r'm`) – auch wenn seine Flags hinter einem eingebetteten Argument stehen
(`docker run -v $(pwd):/app --privileged`).

Die Nachricht eines `git`- oder `gh`-Befehls (`-m "…"`, `--title`, `--body`) ist Text, kein Befehl:
`git commit -m "fix: kill zombie worker"` läuft ohne Rückfrage. Ebenso `git rm -r`, denn Git behält, was
es entfernt.

Schreib-/Edit-Schutz:

- fragt nur bei Schreibzugriffen auf **gefährliche Systempfade** außerhalb des Projekts (Linux/macOS: `/etc`, `/usr`, `/bin`, `/root`, `/var`, `~/.config`, …; Windows: `C:\Windows`, `System32`, …) – normale Pfade außerhalb des Projekts bleiben erlaubt
- fragt bei Schreibzugriffen auf **Secret-Dateien** (`.env`, `*.pem`, `*.key`, …) und **geschützte Ordner** (`.git/`, `.pi/`, inkl. Git-Hooks und Extensions), egal wo sie liegen

Jede Rückfrage zeigt den genauen Befehl oder eine Vorschau der Änderung im Unified-Diff-Stil, mit drei Optionen:

| Option | Wirkung |
|--------|---------|
| **No** (Standard, oben) | Aktion blockieren |
| **Yes, run it** | Diese eine Aktion erlauben |
| **No, with a hint to Pi ...** | Blockieren und dem Modell einen Hinweis schicken, z. B. „lösche nur den Build-Ordner“ |

„No“ steht absichtlich oben, damit ein versehentliches Enter nie etwas Gefährliches freigibt. Ohne
UI zum Nachfragen (`pi -p`) werden gefährliche Aktionen direkt blockiert.

## Modi

| Modus | Wer über eine markierte Aktion entscheidet |
|-------|--------------------------------------------|
| `ask` (Standard) | Du, in der Rückfrage oben |
| `classifier` | Ein Modell. Es lässt die Aktion laufen oder blockiert sie; gefragt wirst du nur nach wiederholten Blocks oder wenn das Modell nicht erreichbar ist |

### Classifier-Modus

```
/ask-when-needed classifier
```

Er funktioniert wie der [Auto-Modus von Claude Code](https://www.anthropic.com/engineering/claude-code-auto-mode), angewendet auf die Aktionen, die die Regeln oben markieren:

- **Was das Modell sieht:** deine Nachrichten und die Tool-Aufrufe des Agenten (die letzten 5 bzw. 20), die markierte Aktion und den Grund der Markierung. Es sieht nie die eigenen Worte des Agenten und keine Tool-Ausgaben: Es beurteilt, was der Agent tut, nicht was er sagt, und Text, der über eine Datei oder Webseite eingeschleust wurde, erreicht es nicht.
- **Zwei Stufen:** ein schnelles Ja/Nein, das im Zweifel blockiert; nur wenn das „blockieren“ sagt, dieselbe Frage noch einmal mit schrittweiser Begründung. Die meisten markierten Aktionen kosten eine kurze Anfrage.
- **Wie es urteilt:** Blockiert wird, was Daten zerstören oder abfließen lassen, die Sicherheit schwächen, eine Vertrauensgrenze überschreiten oder Reviews umgehen bzw. andere betreffen würde – außer eine Ausnahme greift (wiederherstellbare Build-Ausgaben, Push des eigenen Arbeits-Branches, übliche Anmeldeabläufe, vom Agenten selbst gestartete Prozesse) oder du hast genau das verlangt. Was der Agent von sich aus beschließt, gilt nicht als erlaubt; ist die Markierung ein Fehlalarm, läuft die Aktion. `classifier.environment`, `block` und `allow` passen die Regeln an deine Umgebung an.
- **Bei einem Block** bekommt der Agent den Grund und die Anweisung, einen sichereren Weg zu suchen statt den Block zu umgehen, und arbeitet weiter. Nach 3 Blocks in Folge oder 20 in einer Session kommt die normale Rückfrage; ohne UI (`pi -p`) endet der Lauf. Fällt das Modell aus, wirst du ebenfalls gefragt. Jedes Urteil wird angezeigt, z. B. `🤖 claude-haiku-5-5 blocked: the user did not ask to delete it`.
- **Welches Modell:** `classifier.model` als `provider/id` – ein beliebiges Chat-Modell, am besten ein kleines, schnelles. Standard: das Modell der Session.
- **Anders als der Auto-Modus:** Nur markierte Aktionen erreichen das Modell. Alles andere läuft unberührt durch, genau wie im Ask-Modus.

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
| Rekursives Löschen (`rm -r`, `rm -rf`) | ✅ | ✅ (nur `rm -rf`) |
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
| **Geschützte Dateien/Ordner** (`.git/`, `.pi/`, Secrets) | ✅ (konfigurierbare Policies) | ✅ konfigurierbar |

> Anders als `pi-guardrails` hat `ask-when-needed` **keine Settings-UI und kein automatisches
> Ablehnen/Beenden** – ab Werk wird jede Erkennung als **Rückfrage** angezeigt (ablehnen / erlauben /
> ablehnen mit Hinweis), du behältst also bei jeder Aktion die Kontrolle. Diese Entscheidungen einem
> Modell zu übergeben (Classifier-Modus) oder Pfade direkt zu blockieren (`pathAccess`) ist Opt-in.

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

- Standardmäßig aktiv; in der Fußzeile steht `🟡 ask when needed` (plus der Modus, wenn er nicht `ask` ist).
- Interaktiv umschalten:

```
/ask-when-needed              an/aus umschalten
/ask-when-needed on | off
/ask-when-needed ask          du entscheidest (Standard)
/ask-when-needed classifier   ein Modell entscheidet
```

- Die Konfiguration wird automatisch neu geladen, wenn Pi die Extensions neu lädt (`/reload`).

- Startzustand per Umgebungsvariable wählen (`off`, `ask` oder `classifier`; ein Modus schaltet auch dann ein, wenn in der Config `"enabled": false` steht):

```bash
PI_ASK_WHEN_NEEDED=off pi
PI_ASK_WHEN_NEEDED=classifier pi -p "räum das Repo auf"
```

## Konfiguration

Optionale JSON-Konfigurationsdatei; alle Felder sind optional.

**Global:** `~/.pi/agent/extensions/ask-when-needed.json`
**Projekt:** `.pi/extensions/ask-when-needed.json` (überschreibt global; wird nur in Projekten gelesen, denen du vertraust)

Listen **ergänzen** die eingebauten Regeln, alles andere überschreibt sie. Schutz fällt nur dort weg,
wo eine Konfiguration das ausdrücklich sagt (`enabled`, `features`, `allowedPatterns`, `enabled` /
`allowedPatterns` einer Policy, `pathAccess.mode`, `nonInteractive`).

| Feld | Standard | Bedeutung |
|------|----------|-----------|
| `enabled` | `true` | Hauptschalter |
| `mode` | `"ask"` | `ask` oder `classifier`, siehe [Modi](#modi) |
| `classifier.model` | Modell der Session | `provider/id` eines Chat-Modells |
| `classifier.environment` | Projektverzeichnis und sein Git-Repository | Was der Classifier als vertraut ansieht; alles andere gilt als extern |
| `classifier.block` / `classifier.allow` | eingebaute Regeln | Weitere Block-Regeln und Ausnahmen in normaler Sprache (ergänzen die eingebauten) |
| `features` | alle `true` | Kategorie abschalten: `shell`, `secrets`, `git`, `publish`, `powershell`, `pathPolicies` |
| `dangerousCommands` | `[]` | Weitere Befehle, die markiert werden. `pattern` ist ein Teilstring oder mit `"regex": true` ein regulärer Ausdruck |
| `allowedPatterns` | `[]` | Befehle, die nie markiert werden. `pattern` ist der Anfang des Befehls oder ein regulärer Ausdruck |
| `policies` | `secret-files`, `protected-dirs` | Geschützte Pfade (Globs). `noAccess` schützt Lesen und Schreiben, `readOnly` nur Schreiben. Mit einer eingebauten `id` lassen sich `patterns` ergänzen, Ausnahmen (`allowedPatterns`) hinzufügen oder die Policy abschalten (`"enabled": false`) |
| `pathAccess` | `"mode": "ask"` | Schreibzugriffe außerhalb des Projekts auf `dangerousPaths` (Globs, ergänzen die eingebaute Liste): `ask`, `allow` oder `block` ohne Rückfrage |
| `nonInteractive` | `"block"` | Ohne UI: gefährliche Aktionen blockieren (`block`) oder erlauben (`allow`) |

Befehlsmuster werden pro Einzelbefehl geprüft (die Teile zwischen `;`, `&&`, `|`, …), Anführungszeichen
sind dabei entfernt – `git push --force-with-lease` zu erlauben erlaubt also nicht
`git push --force-with-lease && rm -rf ~`.
Globs greifen in jeder Tiefe (`*.pem`, `.ssh` samt allem darunter); ein führendes `/` oder `~` bindet
sie an genau diesen Ort, und `*` überschreitet nie ein `/`.

Ein vollständiges Beispiel steht in [`docs/example-config.json`](docs/example-config.json).

## Entwicklung

```bash
npm install
npm run typecheck  # tsc --noEmit
```

```
src/
  index.ts               Einstiegspunkt: Status, Befehl, Tool-Hook, Modi
  config.ts              Konfigurationsschema, Standards (alle Regeldaten), Laden
  detector.ts            baut aus der Konfiguration eine Prüfung für Shell-/Lese-/Schreibaufrufe
  matcher-utils.ts       Engine: zerlegt Befehle, schiebt die Matcher darüber
  matchers-*.ts          Befehls-Matcher je Kategorie: Shell, Git, Publish, Secrets, PowerShell
  paths.ts               Pfadauflösung, Glob-Matching
  preview.ts             Befehls-/Diff-Vorschau für Rückfragen
  decider.ts             Decider-Vertrag
  decider-ask.ts         Ask-Modus: interaktive Rückfrage
  decider-classifier.ts  Classifier-Modus: ein Modell entscheidet
docs/                    Logo, Beispielkonfiguration
```

Jeder Tool-Aufruf läuft durch zwei austauschbare Stufen – **detect** (was ist gefährlich?) und
**decide** (wer entscheidet?):

- eine neue Erkennungskategorie ist ein `matchers-*.ts`-Modul plus eine Zeile in `CATEGORIES` (`detector.ts`)
- ein neuer Modus ist ein `decider-*.ts`-Modul plus eine Zeile in `MODES` (`index.ts`)
- neue Befehle und Pfadregeln brauchen keinen Code, nur Konfiguration

Version: `version` in `package.json` (aktuell `0.2.0-alpha`); Änderungen stehen in
[CHANGELOG.md](CHANGELOG.md).

## Lizenz

MIT
