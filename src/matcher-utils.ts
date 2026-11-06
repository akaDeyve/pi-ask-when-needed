/**
 * Unified detection engine: structural matchers + substitution scan + config overrides.
 * All matchers use the same pattern: check words, return reason if dangerous.
 */

export type Matcher = (words: string[]) => string | undefined;

// ─── Word helpers ───────────────────────────────────────────────────────────

export const hasFlag = (w: string[], flag: string) =>
  w.some((x) => x === flag || x === `-${flag}` || x === `--${flag}` || (x.startsWith("-") && !x.startsWith("--") && x.includes(flag)));

export const isCmd = (w: string[], ...cmds: string[]) => cmds.includes(w[0] ?? "");

export const hasPrefix = (w: string[], prefix: string) => w.some((x) => x.startsWith(prefix));

// ─── Substitution handling ─────────────────────────────────────────────────

const substitution = (word: string): string | null => {
  if (word.startsWith("$(")) return word.slice(2, -1);
  if (word.startsWith("`")) return word.slice(1, -1);
  return null;
};

export function tokenize(command: string): string[] {
  const words: string[] = [];
  const re = /\$?\((?:[^()]*|\([^()]*\))*\)|`[^`]*`|"[^"]*"|'[^']*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) words.push(m[0]);
  return words;
}

export function flatten(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const inner = substitution(word);
    if (inner !== null) out.push(...tokenize(inner));
    out.push(...word.replace(/["'`]/g, "").split(/[\s|;&><]/).filter(Boolean));
  }
  return out;
}

// ─── Core scan engine ───────────────────────────────────────────────────────

export function scan(words: string[], matchers: Matcher[]): string | undefined {
  for (let i = 0; i < words.length; i++) {
    for (const matcher of matchers) {
      const reason = matcher(words.slice(i));
      if (reason) return reason;
    }
  }
  return undefined;
}

export function checkDangerous(command: string, matchers: Matcher[]): string | undefined {
  return scan(flatten(tokenize(command)), matchers);
}
