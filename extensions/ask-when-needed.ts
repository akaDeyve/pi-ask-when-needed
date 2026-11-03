/**
 * ask-when-needed – Pi fragt nur bei gefährlichen Aktionen nach, alles andere läuft durch.
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

interface Rule {
  pattern: RegExp;
  reason: string;
}

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

// ─── Regeln ─────────────────────────────────────────────────────────────────

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["edit", "write"]);

/** Dateien, die Secrets enthalten können – Lesen und Schreiben gelten als gefährlich. */
const SECRET_FILE =
  /(^|\/)\.(ssh|aws|gnupg|kube|docker|netrc)(\/|$)|(^|\/)\.env(\.[\w-]+)?$|id_(rsa|ed25519|ecdsa)|\.(pem|key|p12)$|credentials/i;

/** Schreiben hier kann Code ausführen oder Pi selbst verändern (Git-Hooks, Extensions). */
const PROTECTED_DIR = /(^|\/)\.(git|pi)(\/|$)/;

const DANGEROUS_COMMANDS: Rule[] = [
  // Löschen und Überschreiben
  { pattern: /\brm\s+(-[a-zA-Z]*[rRf]|--recursive|--force)/, reason: "rekursives oder erzwungenes Löschen" },
  { pattern: /\bfind\b.*\s-(delete|exec\s+rm)\b|\bxargs\s+(-\S+\s+)*rm\b|\b(shred|truncate|wipefs)\b/, reason: "Massenlöschung / Überschreiben" },
  { pattern: /\b(dd|mkfs\w*|fdisk|parted|diskutil)\b/, reason: "Datenträger-Operation" },

  // Rechte und System
  { pattern: /\b(sudo|doas|su)\b/, reason: "Root-Rechte" },
  { pattern: /\b(chmod|chown)\s+(-[a-zA-Z]*R|--recursive)/, reason: "rekursive Rechteänderung" },
  { pattern: /\b(npm|pnpm|yarn)\s+(i|install|add)\b.*\s(-g|--global)\b|\bpip3?\s+install\b.*--user\b|\bbrew\s+(install|uninstall)\b/, reason: "systemweite Installation" },
  { pattern: /\bcrontab\b|\bsystemctl\b|\blaunchctl\b/, reason: "Systemdienste / Autostart" },
  { pattern: /\b(kill|killall|pkill)\b/, reason: "beendet Prozesse" },
  { pattern: /\b(docker|podman)\s+(run|exec)\b.*(--privileged|-v\s*\/:)/, reason: "privilegierter Container" },

  // Git (spezifische Regeln vor allgemeinen)
  { pattern: /\bgit\s+push\b.*(\s--force|\s-f\b)/, reason: "Force-Push" },
  { pattern: /\bgit\s+push\b/, reason: "Push ins Remote-Repository" },
  { pattern: /\bgit\s+(reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+--\s|restore\b|branch\s+-D|stash\s+(drop|clear))/, reason: "verwirft lokale Änderungen" },
  { pattern: /\bgit\s+(filter-branch|filter-repo|rebase)\b|\bgit\s+commit\b.*--amend/, reason: "schreibt Git-History um" },

  // Netzwerk und Veröffentlichung
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, reason: "lädt ein Script und führt es aus" },
  { pattern: /\bcurl\b.*\s(-d|--data\S*|-F|--form|-T|--upload-file)\b|\b(nc|ncat|netcat|socat)\b/, reason: "sendet Daten ins Netz" },
  { pattern: /\b(ssh|scp|sftp|rsync)\b/, reason: "Zugriff auf andere Rechner" },
  { pattern: /\b(npm|pnpm|yarn|cargo|twine|gem)\s+publish\b|\bgh\s+release\b/, reason: "Veröffentlichung" },

  // Secrets und verschleierter Code
  { pattern: /(~|\$HOME|\/home\/[^/\s]+|\/Users\/[^/\s]+)\/\.(ssh|aws|gnupg|kube|config|pi|netrc)\b|\/etc\//, reason: "sensible Pfade" },
  { pattern: /(^|[\s/'"=])\.env(\.[\w-]+)?\b/, reason: "Zugriff auf .env (Secrets)" },
  { pattern: /\b(env|printenv|export\s+-p|set)\s*($|\|)/, reason: "liest Umgebungsvariablen (Secrets)" },
  { pattern: /\beval\b|\bbase64\s+(-d|--decode)\b.*\|/, reason: "führt verschleierten Code aus" },
];

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

/** Unterstützt Einzel-Edits (oldText/newText) und Listen von Edits. */
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
  const rule = DANGEROUS_COMMANDS.find(({ pattern }) => pattern.test(command));
  return rule ? { reason: rule.reason, preview: `$ ${command}` } : null;
}

function checkWrite(tool: string, input: ToolInput, cwd: string): Danger | null {
  const file = resolvePath(cwd, input.path);
  const shown = displayPath(cwd, file);
  const preview = tool === "write" ? writePreview(shown, input) : editPreview(shown, input);

  if (!isInside(cwd, file)) {
    return { reason: "schreibt außerhalb des Projekts", preview };
  }
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

// "Nein" steht oben, damit ein versehentliches Enter nichts Gefährliches auslöst.
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
