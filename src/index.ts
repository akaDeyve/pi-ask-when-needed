/**
 * ask-when-needed – Pi only pauses before dangerous actions; everything else passes through.
 *
 * Install:  pi install git:github.com/akaDeyve/pi-ask-when-needed@main
 * Command:  /ask-when-needed [on|off|ask|classifier]   (no argument: toggle on/off)
 * Start:    PI_ASK_WHEN_NEEDED=off|ask|classifier      (default: on, mode from the config)
 *
 * Every tool call runs through two swappable stages:
 *   1. detect – what is dangerous?  detector.ts ← matchers-*.ts (commands), config.ts (path rules)
 *   2. decide – who decides?        MODES below ← decider-*.ts
 */
import * as path from "node:path";
import { CONFIG_DIR_NAME, type ExtensionAPI, type ExtensionContext, getAgentDir } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, loadConfig } from "./config.ts";
import { type Decider, deny, type Verdict } from "./decider.ts";
import { ask } from "./decider-ask.ts";
import { classifier } from "./decider-classifier.ts";
import { createDetector, type Danger, type ToolInput } from "./detector.ts";

/** A mode is a chain of deciders; the first verdict wins. A new mode is one module plus one line here. */
const MODES: Record<string, Decider[]> = {
  ask: [ask],
  classifier: [classifier, ask],
};
const SWITCH: Record<string, boolean> = { on: true, an: true, off: false, aus: false };
const OPTIONS = ["on", "off", ...Object.keys(MODES)];

const NAME = "ask-when-needed";
const CONFIG_FILE = path.join("extensions", `${NAME}.json`);

export default function askWhenNeeded(pi: ExtensionAPI) {
  const env = process.env.PI_ASK_WHEN_NEEDED?.toLowerCase() ?? "";
  let config = DEFAULT_CONFIG;
  let detect = createDetector(config);
  let enabled = env !== "off";
  let mode = "ask";

  const state = () => (!enabled ? "off" : mode === "ask" ? "on" : mode);
  const showStatus = (ctx: ExtensionContext) =>
    ctx.ui.setStatus(NAME, `${enabled ? "🟡" : "⚪"} ask when needed${state() === "on" ? "" : `: ${state()}`}`);

  /** Runs the deciders of the current mode; if none of them can decide, `nonInteractive` does. */
  async function decide(danger: Danger, ctx: ExtensionContext): Promise<Verdict> {
    if (!danger.block) {
      for (const decider of MODES[mode]) {
        const verdict = await decider(danger, ctx, config);
        if (verdict) return verdict;
      }
      if (config.nonInteractive === "allow") return { allow: true };
    }
    return deny(`Dangerous action blocked without approval: ${danger.reason}.`);
  }

  pi.on("session_start", (_event, ctx) => {
    try {
      const files = [path.join(getAgentDir(), CONFIG_FILE)];
      if (ctx.isProjectTrusted()) files.push(path.join(ctx.cwd, CONFIG_DIR_NAME, CONFIG_FILE));
      const loaded = loadConfig(files);
      detect = createDetector(loaded);
      config = loaded;
    } catch (error) {
      ctx.ui.notify(`${NAME}: invalid config, using defaults – ${(error as Error).message}`, "error");
    }
    mode = [env, config.mode].find((name) => Object.hasOwn(MODES, name)) ?? "ask";
    // A mode named in the environment switches on, like `/ask-when-needed <mode>` does.
    enabled = env !== "off" && (config.enabled || mode === env);
    showStatus(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled) return;
    const danger = detect(event.toolName, event.input as ToolInput, ctx.cwd);
    if (!danger) return;
    const verdict = await decide(danger, ctx);
    return verdict.allow ? undefined : { block: true, reason: verdict.reason, terminate: verdict.terminate };
  });

  pi.registerCommand(NAME, {
    description: `Ask before dangerous actions: ${OPTIONS.join(" | ")} (no argument: toggle on/off)`,
    getArgumentCompletions: (prefix) =>
      OPTIONS.filter((option) => option.startsWith(prefix)).map((option) => ({ value: option, label: option })),
    handler: async (args, ctx) => {
      const arg = args.trim().toLowerCase();
      if (Object.hasOwn(MODES, arg)) [mode, enabled] = [arg, true];
      else if (Object.hasOwn(SWITCH, arg)) enabled = SWITCH[arg];
      else if (!arg) enabled = !enabled;
      else return ctx.ui.notify(`${NAME}: unknown option "${arg}" (${OPTIONS.join(" | ")})`, "warning");
      showStatus(ctx);
      ctx.ui.notify(`ask when needed: ${state()}`, enabled ? "info" : "warning");
    },
  });
}
