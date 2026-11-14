/**
 * Detection: compiles the config into one function that checks shell, read and write tool calls.
 */
import type { CommandPattern, Config } from "./config.ts";
import { scan, type Matcher } from "./matcher-utils.ts";
import { GIT_MATCHERS } from "./matchers-git.ts";
import { POWERSHELL_MATCHERS } from "./matchers-powershell.ts";
import { PUBLISH_MATCHERS } from "./matchers-publish.ts";
import { SECRET_MATCHERS } from "./matchers-secrets.ts";
import { SHELL_MATCHERS } from "./matchers-shell.ts";
import { displayPath, globs, isInside, resolvePath } from "./paths.ts";
import { editPreview, writePreview } from "./preview.ts";

export type ToolInput = Record<string, unknown>;

export interface Danger {
  reason: string;
  preview: string;
  /** Refused without asking anyone (`pathAccess.mode: "block"`). */
  block?: boolean;
}

/** Matcher categories, switched by `features.<name>`. A new category is one module plus one line here. */
const CATEGORIES: Record<string, Matcher[]> = {
  shell: SHELL_MATCHERS,
  secrets: SECRET_MATCHERS,
  git: GIT_MATCHERS,
  publish: PUBLISH_MATCHERS,
};

const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_TOOLS = new Set(["edit", "write"]);

/** Compiles a pattern into a test. A plain pattern matches anywhere in the text, or only at its start. */
function tester({ pattern, regex }: CommandPattern, atStart = false): (text: string) => boolean {
  // An empty pattern would match every command – and as an allowed pattern switch the gate off.
  if (typeof pattern !== "string" || !pattern) throw new Error("a command pattern needs a non-empty `pattern`");
  if (regex) {
    const re = new RegExp(pattern);
    return (text) => re.test(text);
  }
  return atStart ? (text) => text.startsWith(pattern) : (text) => text.includes(pattern);
}

export function createDetector(config: Config) {
  const on = (feature: string) => config.features[feature] !== false;

  const policies = config.policies
    .filter((policy) => policy.enabled !== false)
    .map((policy) => ({
      why: policy.description ?? `policy ${policy.id}`,
      readable: policy.protection === "readOnly",
      match: globs(policy.patterns),
      allow: globs(policy.allowedPatterns),
    }));
  /** Why `file` is protected against this kind of access, if it is. */
  const protection = (file: string, write: boolean) =>
    policies.find((p) => (write || !p.readable) && p.match.test(file) && !p.allow.test(file))?.why;
  /** Why a word of a command, or a glob, names a protected file: `.env*`, `--key=server.pem`, `@.env`, `~/.aws:/creds`. */
  const named = (word: string) =>
    word.replace(/[*?]/g, "").split(/[=@:,{}]/).map((part) => protection(part, false)).find(Boolean);

  const matchers = Object.keys(CATEGORIES).filter(on).flatMap((name) => CATEGORIES[name]);
  for (const custom of config.dangerousCommands) {
    const test = tester(custom);
    // A plain pattern of n words lies within n + 1 words of some starting point; the rest need not be joined.
    const reach = custom.regex ? undefined : custom.pattern.split(" ").length + 1;
    const why = custom.description ?? `dangerous command (${custom.pattern})`;
    matchers.push((w) => (test(w.slice(0, reach).join(" ")) ? why : undefined));
  }
  // Every word of a command may name a protected file (`cat .env`).
  if (on("pathPolicies")) {
    matchers.push((_w, raw) => {
      const why = named(raw);
      return why && `protected path: ${why}`;
    });
  }
  /** Shell tools and their matchers; PowerShell has some of its own. */
  const shells: Record<string, Matcher[]> = {
    bash: matchers,
    powershell: on("powershell") ? [...POWERSHELL_MATCHERS, ...matchers] : matchers,
  };
  // Allowed commands must start with their pattern: a trailing `# git status` must not whitelist anything.
  const allowed = config.allowedPatterns.map((pattern) => tester(pattern, true));
  const { mode, dangerousPaths } = config.pathAccess;
  const dangerous = globs(dangerousPaths);

  return (tool: string, input: ToolInput, cwd: string): Danger | null => {
    if (Object.hasOwn(shells, tool)) {
      const command = String(input.command ?? "").trim();
      // PowerShell: a backtick continues a line and `\` separates the parts of a path.
      const line = tool === "powershell" ? command.replace(/`\r?\n/g, " ").replaceAll("\\", "/") : command;
      const reason = scan(line, shells[tool], allowed);
      return reason ? { reason, preview: `$ ${command}` } : null;
    }
    const write = WRITE_TOOLS.has(tool);
    if (!on("pathPolicies") || !(write || READ_TOOLS.has(tool))) return null;

    const file = resolvePath(cwd, input.path);
    const shown = displayPath(cwd, file);
    // `grep` also picks its files by glob.
    const glob = String(input.glob ?? "");
    const preview = write
      ? (tool === "write" ? writePreview : editPreview)(shown, input)
      : `${tool} ${shown}${glob && ` (${glob})`}`;
    const why = protection(file, write) ?? named(glob);
    if (why) return { reason: `protected path: ${why}`, preview };
    // Outside the project only dangerous paths matter; ordinary paths stay allowed.
    if (write && mode !== "allow" && !isInside(cwd, file) && dangerous.test(file)) {
      return { reason: `writes to dangerous path ${file}`, preview, block: mode === "block" };
    }
    return null;
  };
}
