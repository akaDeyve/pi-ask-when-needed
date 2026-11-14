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
  <a href="LICENSE"><img alt="Lizenz: MIT" src="https://img.shields.io/badge/license-MIT-green"></a>
</p>

<p align="center"><a href="README.md">English</a> · <b>Deutsch</b></p>

Eine Pi-Permission-Extension, die **nur vor gefährlichen Aktionen fragt**. Gewöhnliche Lesezugriffe, Datei-Änderungen, Builds und Tests laufen ohne Unterbrechung. Pi hält nur an, wenn eine Aktion Daten zerstören, den Systemzustand ändern, Secrets abfließen lassen oder etwas veröffentlichen könnte. Im [Classifier-Modus](#classifier-modus) übernimmt ein Modell diese Entscheidung für dich.

> **Alpha:** Mit Ecken und Kanten sowie Änderungen ist zu rechnen.

## Was geschützt wird

Vor diesen Aktionen hält Pi an und zeigt den genauen Befehl bzw. die Änderung:

- **Löschen:** rekursives `rm`, `find -delete`, `xargs rm`, `shred`, `dd`, `mkfs*`
- **System & Rechte:** `sudo`, `doas`, `su`, `pkexec`, rekursives `chmod -R 777` / `chown -R`, `crontab`, `systemctl`, `launchctl`, `kill`
- **Git:** `git push` (inkl. Force-Push), `reset --hard`, `clean -f`, `checkout --`, `rebase`, `--amend`, `branch -D`, `stash drop`, `filter-repo`
- **Veröffentlichen:** `npm` / `pnpm` / `yarn` / `cargo publish`, `twine upload`, `gem push`, `gh release`
- **Secrets:** Dateien wie `.env`, `*.pem`, `*.key`, `id_rsa` oder `*credentials*`; `~/.ssh`, `~/.aws` und andere Credential-Ordner; `printenv` und nacktes `env`
- **Container:** `docker` / `podman run` mit `--privileged`, Host-Namespaces (`--pid`, `--network`, …), Mounts des Root-Dateisystems oder von `docker.sock`
- **PowerShell** (`powershell`-Tool): rekursives `Remove-Item`, `Stop-Process`, `iex`, `Start-Process -Verb RunAs`, `Format-Volume`

Befehle werden auch dann gefunden, wenn sie versteckt sind: hinter `env`, `xargs` oder `time`, in `bash -c`, `$(…)`, Backticks oder Pipes, mit vollem Pfad (`/bin/rm`) oder in Anführungszeichen (`'r'm`). Secret-Dateien sind geschützt, egal ob ein Tool sie liest oder ein Shell-Befehl sie nennt.

Auch **Schreibzugriffe** werden abgefragt: auf gefährliche Systempfade außerhalb des Projekts (`/etc`, `/usr`, `C:\Windows`, …) sowie auf Secret-Dateien und geschützte Ordner (`.git/`, `.pi/`), egal wo sie liegen. Andere Pfade außerhalb des Projekts bleiben erlaubt.

Nachrichten von `git`- und `gh`-Befehlen (`-m`, `--title`, `--body`) sind Text, kein Befehl: `git commit -m "fix: kill zombie worker"` läuft ohne Rückfrage. Ebenso `git rm -r`, denn Git behält, was es entfernt.

Jede Rückfrage bietet drei Optionen:

| Option | Wirkung |
|--------|---------|
| **No** (Standard, oben) | Aktion blockieren |
| **Yes, run it** | Diese eine Aktion erlauben |
| **No, with a hint to Pi ...** | Blockieren und Pi einen Hinweis geben, z. B. „nur den Build-Ordner löschen“ |

„No“ steht absichtlich oben, damit ein versehentliches Enter nichts Gefährliches freigibt. Ohne UI (`pi -p`) werden gefährliche Aktionen direkt blockiert.

## Modi

| Modus | Wer entscheidet |
|-------|-----------------|
| `ask` (Standard) | Du, in der Rückfrage |
| `classifier` | Ein Modell. Du wirst nur nach wiederholten Blocks oder bei Ausfall des Modells gefragt |

### Classifier-Modus

Aktivieren mit `/ask-when-needed classifier`. Er funktioniert wie der [Auto-Modus von Claude Code](https://www.anthropic.com/engineering/claude-code-auto-mode), angewendet auf markierte Aktionen:

- **Was das Modell sieht:** deine letzten 5 Nachrichten, die letzten 20 Tool-Aufrufe des Agenten, die markierte Aktion und den Grund der Markierung. Nie die eigenen Worte des Agenten und keine Tool-Ausgaben – eingeschleuster Text aus einer Datei oder Webseite erreicht das Modell daher nicht.
- **Zwei Stufen:** ein schnelles Ja/Nein, das im Zweifel blockiert. Nur wenn das „block“ sagt, wird dieselbe Frage mit schrittweiser Begründung noch einmal gestellt. Die meisten markierten Aktionen kosten eine kurze Anfrage.
- **Beurteilung:** Blockiert werden Aktionen, die Daten zerstören oder abfließen lassen, die Sicherheit schwächen, eine Vertrauensgrenze überschreiten oder Reviews umgehen – außer eine Ausnahme greift (z. B. wiederherstellbare Build-Ausgaben, Push des eigenen Arbeits-Branches) oder du hast genau das verlangt. Was der Agent von sich aus beschließt, gilt nicht als autorisiert.
- **Bei einem Block** erhält der Agent den Grund und sucht einen sichereren Weg. Nach 3 Blocks in Folge oder 20 in einer Session wirst du gefragt; ohne UI endet der Lauf. Jedes Urteil wird angezeigt.
- **Einstellungen:** `classifier.model` (`provider/id`, am besten ein kleines, schnelles Chat-Modell; Standard: das Modell der Session). `classifier.environment`, `block` und `allow` passen die Regeln an deine Umgebung an.

## Vergleich mit [pi-guardrails](https://github.com/aliou/pi-guardrails)

Beide sind Pi-Permission-Extensions und decken weitgehend dasselbe ab (`rm -rf`, `sudo`, Disk-Tools, rekursives `chmod`/`chown`, Container-Ausbrüche, Secret-Dateien).

- **ask-when-needed** erkennt zusätzlich destruktive Git-Befehle und das Veröffentlichen, was pi-guardrails nicht tut. Standardmäßig fragt jede Erkennung nach.
- **pi-guardrails** hat eine Settings-UI, AST-basiertes Befehls-Parsing und eine stärker konfigurierbare Policy-Engine.

Entscheide nach deinen Hauptrisiken – oder nimm beide für die breiteste Abdeckung; sie kommen sich nicht in die Quere.

## Installation

```bash
# von GitHub
pi install git:github.com/akaDeyve/pi-ask-when-needed@main

# aus einem lokalen Checkout
pi install ./pi-ask-when-needed

# einmalig ausprobieren, ohne Installation
pi -e ./src/index.ts
```

## Benutzung

Standardmäßig aktiv; die Fußzeile zeigt `🟡 ask when needed` (plus den Modus, falls er nicht `ask` ist).

```
/ask-when-needed              an/aus umschalten
/ask-when-needed on | off
/ask-when-needed ask          du entscheidest (Standard)
/ask-when-needed classifier   ein Modell entscheidet
```

Den Startzustand legst du mit `PI_ASK_WHEN_NEEDED` fest (`off`, `ask` oder `classifier`):

```bash
PI_ASK_WHEN_NEEDED=off pi
PI_ASK_WHEN_NEEDED=classifier pi -p "räum das Repo auf"
```

Die Konfiguration wird neu geladen, wenn Pi die Extensions neu lädt (`/reload`).

## Konfiguration

Optionale JSON-Datei; alle Felder sind optional. Die Projektdatei überschreibt die globale.

- **Global:** `~/.pi/agent/extensions/ask-when-needed.json`
- **Projekt:** `.pi/extensions/ask-when-needed.json` (wird nur in Projekten gelesen, denen du vertraust)

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

Listen **ergänzen** die eingebauten Regeln, alles andere überschreibt sie. Schutz wird nur dort abgeschwächt, wo du das ausdrücklich angibst.

| Feld | Standard | Bedeutung |
|------|----------|-----------|
| `enabled` | `true` | Hauptschalter |
| `mode` | `"ask"` | `ask` oder `classifier` |
| `classifier.model` | Modell der Session | Chat-Modell als `provider/id` |
| `classifier.environment` | Projekt und sein Git-Repo | Was als vertraut gilt; alles andere ist extern |
| `classifier.block` / `allow` | eingebaute Regeln | Zusätzliche Block-Regeln und Ausnahmen, in normaler Sprache |
| `features` | alle `true` | Kategorien abschalten: `shell`, `secrets`, `git`, `publish`, `powershell`, `pathPolicies` |
| `dangerousCommands` | `[]` | Zusätzliche Befehle, die markiert werden: ein Teilstring oder mit `"regex": true` ein regulärer Ausdruck |
| `allowedPatterns` | `[]` | Befehle, die nie markiert werden: Anfang des Befehls oder regulärer Ausdruck |
| `policies` | `secret-files`, `protected-dirs` | Geschützte Pfade (Globs). `noAccess` sperrt Lesen und Schreiben, `readOnly` nur Schreiben. Eine eingebaute `id` wiederverwenden, um sie zu erweitern, oder mit `"enabled": false` abschalten |
| `pathAccess` | `"mode": "ask"` | Schreibzugriffe außerhalb des Projekts auf `dangerousPaths` (Globs): `ask`, `allow` oder `block` |
| `nonInteractive` | `"block"` | Ohne UI: gefährliche Aktionen blockieren (`block`) oder erlauben (`allow`) |

Befehlsmuster werden pro einfachem Befehl geprüft (die Teile zwischen `;`, `&&`, `|`, …). `git push --force-with-lease` zu erlauben erlaubt also nicht `git push --force-with-lease && rm -rf ~`. Globs greifen in jeder Tiefe; ein führendes `/` oder `~` bindet sie an genau diesen Ort.

Vollständiges Beispiel: [`docs/example-config.json`](docs/example-config.json).

## Entwicklung

```bash
npm install
npm run typecheck   # tsc --noEmit
```

Jeder Tool-Aufruf durchläuft zwei austauschbare Stufen: **detect** (was ist gefährlich? `detector.ts`, `matchers-*.ts`) und **decide** (wer entscheidet? `decider-*.ts`).

- Neue Erkennungskategorie: ein `matchers-*.ts`-Modul plus eine Zeile in `CATEGORIES` (`detector.ts`).
- Neuer Modus: ein `decider-*.ts`-Modul plus eine Zeile in `MODES` (`index.ts`).
- Neue Befehle und Pfadregeln brauchen nur Konfiguration. Die Standards stehen in `config.ts`.

Änderungen stehen in der [CHANGELOG.md](CHANGELOG.md).

## Lizenz

MIT
