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

export type ToolInput = Record<string, unknown>;

export interface Danger {
  reason: string;
  preview: string;
}

/** All matchers, sorted by priority (earlier ones win). */
const ALL_MATCHERS: Matcher[] = [
  ...SHELL_MATCHERS,
  ...SECRET_MATCHERS,
  ...GIT_MATCHERS,
  ...PUBLISH_MATCHERS,
  ...NETWORK_MATCHERS,
];

export function checkBash(input: ToolInput): Danger | null {
  const command = String(input.command ?? "").trim();
  const reason = checkDangerous(command, ALL_MATCHERS);
  return reason ? { reason, preview: `$ ${command}` } : null;
}

export function checkRead(tool: string, input: ToolInput, cwd: string): Danger | null {
  const file = normalize(resolvePath(cwd, input.path));
  if (!SECRET_FILE.test(file)) return null;
  return { reason: "File may contain secrets", preview: `${tool} ${displayPath(cwd, file)}` };
}

export function checkWrite(tool: string, input: ToolInput, cwd: string): Danger | null {
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

// Preview helpers
const MAX_PREVIEW_LINES = 12;
const MAX_EDIT_LINES = 8;
const MAX_EDITS_SHOWN = 3;

function prefixLines(text: string, prefix: string, maxLines: number): string[] {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).map((line) => `${prefix} ${line}`);
  const hidden = lines.length - maxLines;
  return hidden > 0 ? [...shown, `… (+${hidden} lines)`] : shown;
}

function writePreview(file: string, input: ToolInput): string {
  const content = String(input.content ?? "");
  const lineCount = content.split("\n").length;
  return [`write ${file} (${lineCount} lines)`, ...prefixLines(content, "+", MAX_PREVIEW_LINES)].join("\n");
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
  if (hiddenEdits > 0) lines.push(`… (+${hiddenEdits} more edits)`);
  return lines.join("\n").trimEnd();
}

export function findDanger(tool: string, input: ToolInput, cwd: string): Danger | null {
  if (READ_TOOLS.has(tool)) return checkRead(tool, input, cwd);
  if (tool === "bash") return checkBash(input);
  if (WRITE_TOOLS.has(tool)) return checkWrite(tool, input, cwd);
  return null;
}
