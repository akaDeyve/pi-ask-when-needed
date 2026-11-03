/**
 * Gemeinsame Utilities für die Detection-Matcher von ask-when-needed.
 *
 * Ein Matcher bekommt den Befehl wortweise (Slice ab einem Startindex) und
 * gibt einen deutschen Grund zurück, wenn die Aktion gefährlich ist.
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

// ─── Shell-Worte extrahieren (inkl. Command-Substitution) ───────────────────
// Teilt einen Befehl in Worte und flacht $(...) / `...` auf, damit verschachtelte
// gefährliche Aufrufe erkannt werden (pi-guardrails AST-Verhalten nachgebildet).

export function tokenize(command: string): string[] {
  const words: string[] = [];
  const re = /\$?\((?:[^()]*|\([^()]*\))*\)|`[^`]*`|"[^"]*"|'[^']*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(command))) words.push(m[0]);
  return words;
}

export function splitWords(words: string[]): string[] {
  const out: string[] = [];
  for (const word of words) {
    const inner =
      word.startsWith("$(") ? word.slice(2, -1) : word.startsWith("`") ? word.slice(1, -1) : null;
    if (inner !== null) out.push(...tokenize(inner));
    out.push(...word.replace(/["'`]/g, "").split(/[\s|;&><]/).filter(Boolean));
  }
  return out;
}

/**
 * Sliding-Window über die Worte: jeder Matcher wird auf jedem Startindex
 * aufgerufen (fängt `echo $(cmd)` / `sudo env -i cmd` ab). Zusätzlich wird
 * jede $(...)/`...`-Substitution rekursiv durchsucht.
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
    const inner =
      word.startsWith("$(") ? word.slice(2, -1) : word.startsWith("`") ? word.slice(1, -1) : null;
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
