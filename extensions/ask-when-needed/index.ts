/**
 * ask-when-needed – Pi fragt nur bei gefährlichen Aktionen nach, alles andere läuft durch.
 *
 * Installation:  pi install git:github.com/akaDeyve/pi-ask-when-needed@main
 * Befehl:        /ask-when-needed [on|off]   (ohne Argument: umschalten)
 * Startwert:     an – mit PI_ASK_WHEN_NEEDED=off startet die Extension ausgeschaltet
 *
 * Die Detection ist modular aufgeteilt:
 *   matchers-shell.ts    – Löschen, Privilegien, Disk, Rechte, Container, Dienste
 *   matchers-secrets.ts  – Umgebungsvariablen, verschleierter Code
 *   matchers-git.ts      – destruktive Git-Operationen
 *   matchers-publish.ts  – Releases/Uploads
 *   matchers-network.ts  – Netzwerk/Exfiltration
 *   paths.ts             – Datei-/Pfad-Policies (Secrets, .git/.pi, gefährliche Pfade)
 *   detector.ts          – führt alles zusammen (findDanger)
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { findDanger, type Danger, type ToolInput } from "./detector.ts";

interface StatusUi {
  setStatus?(key: string, text: string): void;
  notify?(message: string, level: "info" | "warning"): void;
}
interface PromptUi {
  select(title: string, options: string[]): Promise<string | undefined>;
  input?(title: string, placeholder?: string): Promise<string | undefined>;
}

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
