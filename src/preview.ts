/**
 * Preview generation for dangerous actions (write/edit).
 */
import type { ToolInput } from "./detector.ts";

const MAX_PREVIEW_LINES = 12;
const MAX_EDIT_LINES = 8;
const MAX_EDITS_SHOWN = 3;

function prefixLines(text: string, prefix: string, maxLines: number): string[] {
  const lines = text.split("\n");
  const shown = lines.slice(0, maxLines).map((line) => `${prefix} ${line}`);
  const hidden = lines.length - maxLines;
  return hidden > 0 ? [...shown, `… (+${hidden} lines)`] : shown;
}

export function writePreview(file: string, input: ToolInput): string {
  const content = String(input.content ?? "");
  const lineCount = content.split("\n").length;
  return [`write ${file} (${lineCount} lines)`, ...prefixLines(content, "+", MAX_PREVIEW_LINES)].join("\n");
}

export function editPreview(file: string, input: ToolInput): string {
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
