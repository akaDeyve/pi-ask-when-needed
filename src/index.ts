/**
 * ask-when-needed – Pi only asks before dangerous actions; everything else passes through.
 *
 * Installation:  pi install git:github.com/akaDeyve/pi-ask-when-needed@main
 * Command:       /ask-when-needed [on|off]   (no argument: toggle)
 * Default:       on – with PI_ASK_WHEN_NEEDED=off the extension starts disabled
 *
 * Detection is split into modules:
 *   matchers-shell.ts    – deletion, privileges, disk, permissions, containers, services
 *   matchers-secrets.ts  – environment variables, obfuscated code
 *   matchers-git.ts      – destructive Git operations
 *   matchers-publish.ts  – releases/uploads
 *   matchers-network.ts  – network/exfiltration
 *   paths.ts             – file/path policies (secrets, .git/.pi, dangerous paths)
 *   detector.ts          – ties everything together (findDanger)
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

// "No" is listed first so that an accidental Enter never triggers anything dangerous.
const CHOICE = {
  reject: "No",
  approve: "Yes, run it",
  rejectWithHint: "No, with a hint to Pi ...",
} as const;

const REJECTED =
  "Rejected by the user. Do not try to achieve the same thing by another route; ask how to proceed instead.";

const block = (reason: string) => ({ block: true as const, reason });

async function askUser(ui: PromptUi, danger: Danger) {
  const choice = await ui.select(`⚠️  ${danger.reason}\n\n${danger.preview}`, Object.values(CHOICE));
  if (choice === CHOICE.approve) return undefined;
  if (choice === CHOICE.rejectWithHint) {
    const hint = (await ui.input?.("Hint for Pi", "e.g. \"only delete the build folder\""))?.trim();
    if (hint) return block(`Rejected by the user. User's hint: ${hint}`);
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
    ui?.setStatus?.(STATUS_KEY, enabled ? "🟡 ask when needed" : "⚪ ask when needed: off");

  const setEnabled = (ui: StatusUi | undefined, value: boolean) => {
    enabled = value;
    showStatus(ui);
    ui?.notify?.(`ask when needed: ${enabled ? "on" : "off"}`, enabled ? "info" : "warning");
  };

  pi.on("session_start", async (_event, ctx) => {
    showStatus(ctx.ui);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled) return;

    const danger = findDanger(event.toolName, (event.input ?? {}) as ToolInput, ctx.cwd);
    if (!danger) return;

    if (!ctx.hasUI) {
      return block(`Dangerous action blocked without interactive approval: ${danger.reason}`);
    }
    return askUser(ctx.ui, danger);
  });

  pi.registerCommand("ask-when-needed", {
    description: "Toggle asking before dangerous actions on/off (on | off)",
    handler: async (args, ctx) => {
      setEnabled(ctx.ui, parseToggle(args, enabled));
    },
  });

}
