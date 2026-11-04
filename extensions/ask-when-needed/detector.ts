/**
 * Central detection: combines all matcher categories and checks
 * bash, read, and write tool calls.
 */
import * as path from "node:path";
import { checkDangerous, type Matcher } from "./matcher-utils.ts";
import { SHELL_MATCHERS } from "./matchers-shell.ts";
import { SECRET_MATCHERS } from "./matchers-secrets.ts";
import { GIT_MATCHERS } from "./matchers-git.ts";
import { PUBLISH_MATCHERS } from "./matchers-publish.ts";
import { NETWORK_MATCHERS } from "./matchers-network.ts";
import {
  READ_TOOLS,
  WRITE_TOOLS,
  SECRET_FILE,
  PROTECTED_DIR,
  isDangerousOutside,
  resolvePath,
  isInside,
  displayPath,
} from "./paths.ts";
import { loadConfig, type Config } from "./config.ts";
import { writePreview, editPreview } from "./preview.ts";

export type ToolInput = Record<string, unknown>;

export interface Danger {
  reason: string;
  preview: string;
}

let cachedConfig: Config | null = null;
export function getConfig(cwd: string): Config {
  if (!cachedConfig) cachedConfig = loadConfig(cwd);
  return cachedConfig;
}
export function reloadConfig(cwd: string): Config {
  cachedConfig = loadConfig(cwd);
  return cachedConfig;
}

function buildMatchers(config: Config): Matcher[] {
  const matchers: Matcher[] = [];
  if (config.features.shell) matchers.push(...SHELL_MATCHERS);
  if (config.features.secrets) matchers.push(...SECRET_MATCHERS);
  if (config.features.git) matchers.push(...GIT_MATCHERS);
  if (config.features.publish) matchers.push(...PUBLISH_MATCHERS);
  if (config.features.network) matchers.push(...NETWORK_MATCHERS);
  // Custom dangerous commands
  for (const { pattern, regex, description } of config.dangerousCommands) {
    matchers.push((w) => {
      const joined = w.join(" ");
      return (regex ? new RegExp(pattern).test(joined) : joined.includes(pattern)) ? description : undefined;
    });
  }
  return matchers;
}

export function checkBash(input: ToolInput, cwd: string): Danger | null {
  const command = String(input.command ?? "").trim();
  const config = getConfig(cwd);
  if (!config.enabled) return null;
  const matchers = buildMatchers(config);
  const reason = checkDangerous(command, matchers);
  if (reason) {
    // Check allowed patterns
    for (const { pattern, regex } of config.allowedPatterns) {
      if (regex ? new RegExp(pattern).test(command) : command.includes(pattern)) return null;
    }
    return { reason, preview: `$ ${command}` };
  }
  return null;
}

export function checkRead(tool: string, input: ToolInput, cwd: string): Danger | null {
  const config = getConfig(cwd);
  if (!config.enabled || !config.features.pathPolicies) return null;
  const file = normalize(resolvePath(cwd, input.path));
  if (!SECRET_FILE.test(file)) return null;
  return { reason: "File may contain secrets", preview: `${tool} ${displayPath(cwd, file)}` };
}

export function checkWrite(tool: string, input: ToolInput, cwd: string): Danger | null {
  const config = getConfig(cwd);
  if (!config.enabled || !config.features.pathPolicies) return null;
  const file = normalize(resolvePath(cwd, input.path));
  const shown = displayPath(cwd, file);
  const preview = tool === "write" ? writePreview(shown, input) : editPreview(shown, input);

  const rel = path.relative(cwd, file).split(path.sep).join("/");
  if (SECRET_FILE.test(file) || PROTECTED_DIR.test(file) || PROTECTED_DIR.test(rel)) {
    return { reason: "Protected file (secrets, .git or .pi)", preview };
  }
  // "Outside project" only for dangerous system paths (Linux/Mac/Windows);
  // otherwise allowed.
  if (!isInside(cwd, file) && isDangerousOutside(file)) {
    return { reason: `Writes to dangerous system path (${file})`, preview };
  }
  return null;
}

// Windows backslashes → '/' so the patterns (which expect '/') match.
function normalize(file: string): string {
  return file.split(path.sep).join("/");
}

export function findDanger(tool: string, input: ToolInput, cwd: string): Danger | null {
  if (READ_TOOLS.has(tool)) return checkRead(tool, input, cwd);
  if (tool === "bash") return checkBash(input, cwd);
  if (WRITE_TOOLS.has(tool)) return checkWrite(tool, input, cwd);
  return null;
}
