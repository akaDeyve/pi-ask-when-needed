/**
 * Shared utilities for the detection matchers of ask-when-needed.
 *
 * A matcher receives the command word by word (slice starting at an index) and
 * returns a reason if the action is dangerous.
 */

export type Matcher = (w: string[]) => string | undefined;

export function hasArg(words: string[], prefix: string): boolean {
  return words.some((w) => w.startsWith(prefix));
}
export function hasShortFlag(words: string[], flag: string): boolean {
  return words.some(
    (w) => w === `-${flag}` || (w.startsWith("-") && !w.startsWith("--") && w.includes(flag))
  );
}
export function hasLongOption(words: string[], option: string): boolean {
  return words.some((w) => w === `--${option}`);
}
export function isOneOf(words: string[], ...cmds: string[]): boolean {
  return cmds.includes(words[0] ?? "");
}

// ─── Extract shell words (incl. command substitution) ───────────────────────
// Splits a command into words and flattens $(...) / `...` so that nested
// dangerous invocations are detected (mirrors pi-guardrails AST behavior).

export function tokenize(command: string): string[] {
  const words: string[] = [];
  const re = /\$?\((?:[^()]*|\([^()]*\))*\)|`[^`]*`|"[^"]*"|'[^']*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) words.push(m[0]);
  return words;
}

/** Extract the inner content of a $(...) or `...` substitution, or null. */
function substitution(word: string): string | null {
  if (word.startsWith("$(")) return word.slice(2, -1);
  if (word.startsWith("`")) return word.slice(1, -1);
  return null;
}

export function splitWords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const inner = substitution(word);
    if (inner !== null) out.push(...tokenize(inner));
    out.push(...word.replace(/["'`]/g, "").split(/[\s|;&><]/).filter(Boolean));
  }
  return out;
}

/**
 * Sliding window over the words: each matcher is called at every start index
 * (catches `echo $(cmd)` / `sudo env -i cmd`). Additionally, every
 * $(...)/`...` substitution is searched recursively.
 */
export function scanWords(words: string[], matchers: Matcher[]): string | undefined {
  for (let i = 0; i < words.length; i++) {
    const slice = words.slice(i);
    for (const matcher of matchers) {
      const reason = matcher(slice);
      if (reason) return reason;
    }
  }
  for (const word of words) {
    const inner = substitution(word);
    if (inner !== null) {
      const reason = scanWords(splitWords(tokenize(inner)), matchers);
      if (reason) return reason;
    }
  }
  return undefined;
}

export function checkDangerous(command: string, matchers: Matcher[]): string | undefined {
  return scanWords(splitWords(tokenize(command)), matchers);
}
