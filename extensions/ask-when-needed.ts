/**
 * ask-when-needed – Pi fragt nur bei gefährlichen Aktionen nach, alles andere läuft durch.
 *
 * Detection ist zu ~1:1 mit aliou/pi-guardrails' permission-gate + secret-file policies
 * abgeglichen (Container-Escapes, Disk-Partitioning, Privilegien, Secret-Reads,
 * Command-Substitution) und deckt zusätzlich destruktive Git-, Publishing- und
 * Netzwerk/Exfiltrations-Kommandos ab.
 *
 * Installation:  ~/.pi/agent/extensions/ask-when-needed.ts
 * Testen:        pi -e ./ask-when-needed.ts
 * Befehl:        /ask-when-needed [on|off]   (ohne Argument: umschalten)
 * Startwert:     an – mit PI_ASK_WHEN_NEEDED=off startet die Extension ausgeschaltet
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as os from "node:os";
import * as path from "node:path";

// ─── Typen ──────────────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>;

interface Danger {
  reason: string;
  preview: string;
}

/** Die Teile der Pi-UI, die diese Extension nutzt. */
interface StatusUi {
  setStatus?(key: string, text: string): void;
  notify?(message: string, level: "info" | "warning"): void;
}

interface PromptUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  input?(title: string, placeholder?: string): Promise<string | undefined>;
}

// ─── Secret-Dateien (pi-guardrails "policies") ──────────────────────────────

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["edit", "write"]);

/**
 * Dateien, die Secrets enthalten können (Lesen UND Schreiben gilt als gefährlich).
 * Entspricht pi-guardrails' secret-file patterns.
 */
const SECRET_FILE =
  /(^|\/)\.(ssh|aws|gnupg|kube|docker|netrc)(\/|$)|(^|\/)\.env(\.[\w-]+)?$|(^|\/)\.dev\.vars$|\.(pem|key|p12)$|(^|\/)id_(rsa|ed25519|ecdsa)$|credentials|\.gpg$/i;

/** Schreiben hier kann Code ausführen oder Pi selbst verändern (Git-Hooks, Extensions). */
const PROTECTED_DIR = /(^|\/)\.(git|pi)(\/|$)/;

// ─── Befehls-Erkennung (permission-gate) ────────────────────────────────────

// Matcher bekommen den Befehl wortweise (wie pi-guardrails' StructuralMatcher).
type Matcher = (w: string[]) => string | undefined;

function hasArg(words: string[], prefix: string): boolean {
  return words.some((w) => w.startsWith(prefix));
}
function hasShortFlag(words: string[], flag: string): boolean {
  return words.some((w) => w === `-${flag}` || (w.startsWith("-") && !w.startsWith("--") && w.includes(flag)));
}
function hasLongOption(words: string[], option: string): boolean {
  return words.some((w) => w === `--${option}`);
}

// ─ Datei-/Verzeichnis-Zerstörung ─
const rmMatcher: Matcher = (w) => {
  if (w[0] !== "rm" && w[0] !== "xargs") return undefined;
  if (w[0] === "xargs") return w.includes("rm") ? "Massenlöschung (xargs rm)" : undefined;
  const recursive = hasShortFlag(w, "r") || hasShortFlag(w, "R") || hasLongOption(w, "recursive") || hasLongOption(w, "dir");
  const force = hasShortFlag(w, "f") || hasLongOption(w, "force");
  return recursive && force ? "rekursives Löschen erzwingen" : undefined;
};
const massDeleteMatcher: Matcher = (w) => {
  if (w[0] === "find") {
    const execIdx = w.indexOf("-exec");
    if (hasLongOption(w, "delete") || w.includes("-delete")) return "Massenlöschung (find -delete)";
    if (execIdx !== -1 && w.slice(execIdx).includes("rm")) return "Massenlöschung (find -exec rm)";
  }
  return undefined;
};
const shredMatcher: Matcher = (w) => (w[0] === "shred" ? "sicheres Überschreiben (shred)" : undefined);
const truncateMatcher: Matcher = (w) =>
  ["truncate", "wipefs", "diskutil"].includes(w[0] ?? "") ? "Datei/Datenträger überschreiben" : undefined;

// ─ Privilegien ─
const sudoMatcher: Matcher = (w) => (w[0] === "sudo" ? (w.includes("-E") ? "Root-Rechte (sudo -E, Umgebung/Secrets)" : "Root-Rechte (sudo)") : undefined);
const doasMatcher: Matcher = (w) => (w[0] === "doas" ? "Root-Rechte (doas)" : undefined);
const suMatcher: Matcher = (w) => (w[0] === "su" ? "Benutzerwechsel (su)" : undefined);
const pkexecMatcher: Matcher = (w) => (w[0] === "pkexec" ? "Root-Rechte (pkexec)" : undefined);

// ─ Disk/Dateisystem (pi-guardrails) ─
const ddMatcher: Matcher = (w) => (w[0] === "dd" && hasArg(w, "of=") ? "Disk-Schreibzugriff (dd of=)" : undefined);
const mkfsMatcher: Matcher = (w) => (w[0] === "mkfs" || w[0]?.startsWith("mkfs.") ? "Dateisystem formatieren" : undefined);
const wipefsMatcher: Matcher = (w) => (w[0] === "wipefs" ? "Dateisystem-Signatur löschen" : undefined);
const blkdiscardMatcher: Matcher = (w) => (w[0] === "blkdiscard" ? "Blockgerät verwerfen" : undefined);
const fdiskMatcher: Matcher = (w) => (["fdisk","sfdisk","cfdisk"].includes(w[0] ?? "") ? "Disk-Partitionierung" : undefined);
const partedMatcher: Matcher = (w) => (["parted","sgdisk"].includes(w[0] ?? "") ? "Disk-Partitionierung" : undefined);

// ─ Rechteänderung (pi-guardrails: nur 777-style rekursiv) ─
const chmodMatcher: Matcher = (w) => {
  if (w[0] !== "chmod") return undefined;
  const recursive = hasShortFlag(w, "R") || hasLongOption(w, "recursive");
  const worldWritable = w.some((x) => ["777","0777","a+rwx","ugo+rwx","7777","1777"].includes(x));
  return recursive && worldWritable ? "unsichere rekursive Rechte (chmod -R 777)" : undefined;
};
const chownMatcher: Matcher = (w) => (w[0] === "chown" && (hasShortFlag(w, "R") || hasLongOption(w, "recursive")) ? "rekursive Besitzeränderung" : undefined);

// ─ Container-Escapes (pi-guardrails) ─
// Hinweis: der Tokenizer fasst "-v /:/host" zu "-v:/:/host" zusammen,
// daher werden Mount-Muster sowohl an Leerzeichen- als auch an ':'-Formen gematcht.
const containerMatcher: Matcher = (w) => {
  const cmd = w[0];
  if (!cmd || (cmd !== "docker" && cmd !== "podman")) return undefined;
  const sub = w[1];
  if (sub !== "run" && sub !== "create") return undefined;
  if (w.some((x) => x === "--privileged" || x.startsWith("--privileged="))) return "privilegierter Container";
  if (w.some((x) => x === "--pid=host" || x.startsWith("--pid=host"))) return "Container mit Host-PID-Namespace";
  if (w.some((x) => x === "--network=host" || x.startsWith("--network=host"))) return "Container mit Host-Netzwerk";
  if (w.some((x) => x === "--userns=host" || x.startsWith("--userns=host"))) return "Container mit Host-Userns";
  if (w.some((x) => x === "--uts=host" || x.startsWith("--uts=host"))) return "Container mit Host-UTS";
  if (w.some((x) => x === "--ipc=host" || x.startsWith("--ipc=host"))) return "Container mit Host-IPC";
  // Root-Mount: "-v /:/host" wird vom Tokenizer zu ["-v","/","/host"] (oder ["-v:/:/host"]),
  // daher das Argumentpaar (Option + Folgewort) prüfen, nicht nur ein einzelnes Wort.
  for (let i = 0; i < w.length; i++) {
    const word = w[i];
    const next = w[i + 1] ?? "";
    if (/^(-v|--volume)$/i.test(word) && (next.startsWith("/:") || next === "/")) return "Container mit Root-Filesystem-Mount";
    if (word.startsWith("--volume=/:") || word.startsWith("--mount=type=bind,source=/,")) return "Container mit Root-Filesystem-Mount";
    if (word.includes("/var/run/docker.sock") || word.includes("/run/docker.sock") || word.includes("/var/run/podman.sock") || word.includes("/run/podman.sock")) return "Container mit Docker-Socket";
  }
  return undefined;
};

// ─ Systemdienste / Prozesse ─
const serviceMatcher: Matcher = (w) => (["crontab","systemctl","launchctl"].includes(w[0] ?? "") ? "Systemdienste / Autostart" : undefined);
const killMatcher: Matcher = (w) => (["kill","killall","pkill"].includes(w[0] ?? "") ? "beendet Prozesse" : undefined);

// ─ Secret-Lesen über Shell (pi-guardrails) ─
const printenvMatcher: Matcher = (w) =>
  w[0] === "printenv" || (w[0] === "env" && w.length === 1) || (w[0] === "set" && w.length === 1)
    ? "liest Umgebungsvariablen (Secrets)"
    : undefined;

// ─ Git (ask-when-needed Erweiterung, pi-guardrails hat das nicht) ─
const gitMatcher: Matcher = (w) => {
  if (w[0] !== "git") return undefined;
  const sub = w[1] ?? "";
  if (sub === "push") return w.some((x) => x === "--force" || x === "-f") ? "Force-Push" : "Push ins Remote-Repository";
  if (sub === "reset" && w[2] === "--hard") return "verwirft lokale Änderungen (git reset --hard)";
  if (sub === "clean" && hasShortFlag(w, "f")) return "verwirft untracked Dateien (git clean -f)";
  if (sub === "checkout" && w[2] === "--") return "verwirft Änderungen (git checkout --)";
  if (sub === "restore") return "verwirft Änderungen (git restore)";
  if (sub === "branch" && hasShortFlag(w, "D")) return "löscht Branch hart (git branch -D)";
  if (sub === "stash" && (w[2] === "drop" || w[2] === "clear")) return "verwirft Stash";
  if (["filter-branch","filter-repo","rebase"].includes(sub)) return "schreibt Git-History um";
  if (sub === "commit" && w.includes("--amend")) return "ändert letzten Commit (--amend)";
  return undefined;
};

// ─ Publishing (ask-when-needed Erweiterung) ─
const publishMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (["npm","pnpm","yarn"].includes(cmd) && w[1] === "publish") return "Veröffentlichung (Package-Registry)";
  if (cmd === "cargo" && w[1] === "publish") return "Veröffentlichung (crates.io)";
  if (cmd === "twine" && w[1] === "upload") return "Veröffentlichung (PyPI)";
  if (cmd === "gem" && w[1] === "push") return "Veröffentlichung (RubyGems)";
  if (cmd === "gh" && w[1] === "release") return "Veröffentlichung (GitHub Release)";
  return undefined;
};

// ─ Netzwerk/Exfiltration (ask-when-needed Erweiterung) ─
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const netMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (cmd === "curl" || cmd === "wget") {
    if (w.some((x) => x === "-d" || x.startsWith("--data") || x === "-F" || x.startsWith("--form") || x === "-T" || x === "--upload-file")) return "sendet Daten ins Netz (Upload)";
    // Pipe-to-shell: Der Tokenizer entfernt '|', daher prüfen wir, ob nach der
    // URL/Optionen ein Shell-Interpreter direkt folgt (Wortfolge "... sh/bash").
    for (let i = 1; i < w.length; i++) {
      const tok = w[i];
      if (tok === "|" || tok === "||") {
        const next = w[i + 1];
        if (next && (SHELLS.has(next) || next.startsWith("bash") || next.startsWith("sh"))) return "lädt Script und führt es aus (pipe to shell)";
      }
      if (SHELLS.has(tok) || tok.startsWith("bash") || tok.startsWith("sh")) return "lädt Script und führt es aus (pipe to shell)";
    }
  }
  if (["nc","ncat","netcat","socat"].includes(cmd)) return "Netzwerk-Tool (nc/socat)";
  if (["ssh","scp","sftp","rsync"].includes(cmd)) return "Zugriff auf andere Rechner";
  return undefined;
};

// ─ Verschleierung ─
const obfuscationMatcher: Matcher = (w) => {
  if (w[0] === "eval") return "führt dynamischen Code aus (eval)";
  if (w[0] === "base64" && (hasLongOption(w, "decode") || hasShortFlag(w, "d"))) return "dekodiert verschleierten Code (base64 -d)";
  return undefined;
};

/** Reihenfolge = Priorität (frühere Matcher gewinnen). */
const MATCHERS: Matcher[] = [
  rmMatcher, shredMatcher, massDeleteMatcher, truncateMatcher,
  sudoMatcher, doasMatcher, suMatcher, pkexecMatcher,
  ddMatcher, mkfsMatcher, wipefsMatcher, blkdiscardMatcher, fdiskMatcher, partedMatcher,
  chmodMatcher, chownMatcher,
  containerMatcher,
  serviceMatcher, killMatcher,
  printenvMatcher,
  gitMatcher, publishMatcher, netMatcher, obfuscationMatcher,
];

// ─── Shell-Worte extrahieren (inkl. Command-Substitution) ───────────────────
// Teilt einen Befehl in Worte und flacht $(...) / `...` auf, damit verschachtelte
// gefährliche Aufrufe erkannt werden (pi-guardrails AST-Verhalten nachgebildet).

function tokenize(command: string): string[] {
  const words: string[] = [];
  const re = /\$?\((?:[^()]*|\([^()]*\))*\)|`[^`]*`|"[^"]*"|'[^']*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) words.push(m[0]);
  return words;
}

function splitWords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    // $(...) oder `...` → Inhalt als eigene Worte
    const inner = word.startsWith("$(") ? word.slice(2, -1) : word.startsWith("`") ? word.slice(1, -1) : null;
    if (inner !== null) out.push(...tokenize(inner));
    // Anführungszeichen entfernen, dann auf Leerzeichen/Operatoren splitten
    const cleaned = word.replace(/["'`]/g, "").split(/[\s|;&><]/).filter(Boolean);
    out.push(...cleaned);
  }
  return out;
}

export // Rekursiv: prüft einen Wort-Array und alle darin enthaltenen $(...)/`...`-Substitutionen.
function scanWords(words: string[]): string | undefined {
  // Sliding-Window: Matcher auf jedem Startindex (fängt "echo $(cmd)" / sudo env -i cmd ab),
  // dazu jede Substitution einzeln rekursiv durchsuchen.
  for (let i = 0; i < words.length; i++) {
    const slice = words.slice(i);
    for (const matcher of MATCHERS) {
      const reason = matcher(slice);
      if (reason) return reason;
    }
  }
  for (const word of words) {
    const inner = word.startsWith("$(") ? word.slice(2, -1) : word.startsWith("`") ? word.slice(1, -1) : null;
    if (inner !== null) {
      const reason = scanWords(splitWords(tokenize(inner)));
      if (reason) return reason;
    }
  }
  return undefined;
}

export function checkDangerousCommand(command: string): string | undefined {
  return scanWords(splitWords(tokenize(command)));
}

// ─── Pfade ──────────────────────────────────────────────────────────────────

function resolvePath(cwd: string, value: unknown): string {
  const raw = String(value ?? ".");
  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  return path.resolve(cwd, expanded);
}

function isInside(cwd: string, file: string): boolean {
  return file === cwd || file.startsWith(cwd + path.sep);
}

function displayPath(cwd: string, file: string): string {
  return isInside(cwd, file) ? path.relative(cwd, file) || "." : file;
}

// ─── Vorschau ───────────────────────────────────────────────────────────────

const MAX_PREVIEW_LINES = 12;
const MAX_EDIT_LINES = 8;
const MAX_EDITS_SHOWN = 3;

function prefixLines(text: string, prefix: string, maxLines: number): string[] {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).map((line) => `${prefix} ${line}`);
  const hidden = lines.length - maxLines;
  return hidden > 0 ? [...shown, `… (+${hidden} Zeilen)`] : shown;
}

function writePreview(file: string, input: ToolInput): string {
  const content = String(input.content ?? "");
  const lineCount = content.split("\n").length;
  return [`write ${file} (${lineCount} Zeilen)`, ...prefixLines(content, "+", MAX_PREVIEW_LINES)].join("\n");
}

function editPreview(file: string, input: ToolInput): string {
  const edits = (Array.isArray(input.edits) ? input.edits : [input]) as ToolInput[];
  const lines = [`edit ${file}`];
  for (const edit of edits.slice(0, MAX_EDITS_SHOWN)) {
    const oldText = String(edit.oldText ?? edit.old_string ?? "");
    const newText = String(edit.newText ?? edit.new_string ?? "");
    lines.push(...prefixLines(oldText, "-", MAX_EDIT_LINES), ...prefixLines(newText, "+", MAX_EDIT_LINES), "");
  }
  const hiddenEdits = edits.length - MAX_EDITS_SHOWN;
  if (hiddenEdits > 0) lines.push(`… (+${hiddenEdits} weitere Edits)`);
  return lines.join("\n").trimEnd();
}

// ─── Erkennung ──────────────────────────────────────────────────────────────

function checkRead(tool: string, input: ToolInput, cwd: string): Danger | null {
  const file = resolvePath(cwd, input.path);
  if (!SECRET_FILE.test(file)) return null;
  return { reason: "Datei kann Secrets enthalten", preview: `${tool} ${displayPath(cwd, file)}` };
}

function checkBash(input: ToolInput): Danger | null {
  const command = String(input.command ?? "").trim();
  const reason = checkDangerousCommand(command);
  return reason ? { reason, preview: `$ ${command}` } : null;
}

function checkWrite(tool: string, input: ToolInput, cwd: string): Danger | null {
  const file = resolvePath(cwd, input.path);
  const shown = displayPath(cwd, file);
  const preview = tool === "write" ? writePreview(shown, input) : editPreview(shown, input);
  if (!isInside(cwd, file)) return { reason: "schreibt außerhalb des Projekts", preview };
  if (SECRET_FILE.test(file) || PROTECTED_DIR.test(path.relative(cwd, file))) {
    return { reason: "geschützte Datei (Secrets, .git oder .pi)", preview };
  }
  return null;
}

function findDanger(tool: string, input: ToolInput, cwd: string): Danger | null {
  if (READ_TOOLS.has(tool)) return checkRead(tool, input, cwd);
  if (tool === "bash") return checkBash(input);
  if (WRITE_TOOLS.has(tool)) return checkWrite(tool, input, cwd);
  return null;
}

// ─── Rückfrage ──────────────────────────────────────────────────────────────

const CHOICE = {
  reject: "Nein",
  approve: "Ja, ausführen",
  rejectWithHint: "Nein, mit Hinweis an Pi …",
} as const;

const REJECTED =
  "Vom Benutzer abgelehnt. Versuche nicht, dasselbe auf anderem Weg zu erreichen; frag nach, wie es weitergehen soll.";

const block = (reason: string) => ({ block: true as const, reason });

async function askUser(ui: PromptUi, danger: Danger) {
  const choice = await ui.select(`⚠️  ${danger.reason}\n\n${danger.preview}`, Object.values(CHOICE));
  if (choice === CHOICE.approve) return undefined;
  if (choice === CHOICE.rejectWithHint) {
    const hint = (await ui.input?.("Hinweis an Pi", "z. B. „lösch nur den build-Ordner“"))?.trim();
    if (hint) return block(`Vom Benutzer abgelehnt. Hinweis des Benutzers: ${hint}`);
  }
  return block(REJECTED);
}

// ─── Extension ──────────────────────────────────────────────────────────────

const STATUS_KEY = "ask-when-needed";

function parseToggle(arg: string | undefined, current: boolean): boolean {
  const value = (arg ?? "").trim().toLowerCase();
  if (value === "on" || value === "an") return true;
  if (value === "off" || value === "aus") return false;
  return !current;
}

export default function askWhenNeeded(pi: ExtensionAPI) {
  let enabled = process.env.PI_ASK_WHEN_NEEDED?.toLowerCase() !== "off";

  const showStatus = (ui?: StatusUi) =>
    ui?.setStatus?.(STATUS_KEY, enabled ? "🟡 ask when needed" : "⚪ ask when needed: aus");

  const setEnabled = (ui: StatusUi | undefined, value: boolean) => {
    enabled = value;
    showStatus(ui);
    ui?.notify?.(`ask when needed: ${enabled ? "an" : "aus"}`, enabled ? "info" : "warning");
  };

  pi.on("session_start", async (_event, ctx) => {
    showStatus(ctx.ui);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled) return;

    const danger = findDanger(event.toolName, (event.input ?? {}) as ToolInput, ctx.cwd);
    if (!danger) return;

    if (!ctx.hasUI) {
      return block(`Gefährliche Aktion ohne interaktive Freigabe blockiert: ${danger.reason}`);
    }
    return askUser(ctx.ui, danger);
  });

  pi.registerCommand("ask-when-needed", {
    description: "Rückfragen bei gefährlichen Aktionen an/aus (on | off)",
    handler: async (args, ctx) => {
      setEnabled(ctx.ui, parseToggle(args, enabled));
    },
  });
}
