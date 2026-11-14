/**
 * Detection engine: splits a command line into simple commands and slides every matcher over
 * each of them, so a dangerous call is found wherever it hides (`env rm -rf x`, `bash -c "…"`,
 * `X=$(…)`, pipes, subshells).
 */

/**
 * Gets the words of a simple command, starting at a possible command name (without its bin
 * directory; `raw` is that first word as written, `before` the word in front of it). Returns
 * why the command is dangerous.
 */
export type Matcher = (words: string[], raw: string, before?: string) => string | undefined;

/** Words a matcher gets at most. Keeps a huge one-line command (a pasted data blob) from freezing Pi. */
const WINDOW = 256;

/** True if a flag is set: `--long`, `-s`, or `s` inside a short group (`-rf`). `short` may list several letters. */
export const hasFlag = (w: string[], short: string, long?: string) =>
  w.some((x) => (long !== undefined && x === `--${long}`) || (/^-[^-]/.test(x) && [...short].some((c) => x.includes(c))));

/** `/usr/bin/rm` and `node_modules/.bin/npm` are still `rm` and `npm`. */
const BIN_DIR = /^(.*\/)?\.?s?bin\//;

/**
 * Text that is never run: the message of a `git`/`gh`/`glab` command – `-m "…"`, `--body '…'`,
 * or one fed from a quoted here-document. Only a string without expansions counts, and only if
 * the command stands at the start of a simple command with intact quotes in front of the option.
 */
const TEXT =
  /(?<=(?:^|[;&|\n(])\s*(?:git|gh|glab)\s(?:[^;&|\n"']|"[^"]*"|'[^']*')*\s(?:-m|--message|--title|--body|--notes|--description)[= ])(?:"[^"$`]*"|'[^']*'|"\$\(cat <<-?\s*(['"])(\w+)\1\n[^]*?\n\2\s*\)")/g;

/** What a command nests, capturing the content: `$(…)`, `<(…)`, a subshell, a call in inline code (`f(…)`), backticks. */
const NESTED = /(?<![$<>\w.])[$<>\w.]*\(([^()]*)\)|`([^`]*)`/g;
/** Levels of brackets that are unwrapped within one part. */
const DEPTH = 32;
/** A redirection with its target: `2>/dev/null`, `>> out.log`, `2>&1`, `<<'EOF'`. */
const REDIRECT = /[\d&]?[<>]+[&|-]?[ \t]*[^\s;&|<>()]*/g;

/**
 * Quotes and escapes are dropped and every separator, substitution, subshell and redirection
 * starts a new command, so quoted and nested commands are scanned like top-level ones. A `(`
 * right after a word stays attached to it: `eval(` in inline code is not the command `eval`,
 * while `if(rm -rf x)` still splits.
 */
const split = (text: string) =>
  text
    .replace(/\\\r?\n/g, " ")
    .replace(/["'\\]/g, "")
    .split(/[;&|)<>`\r\n]|(?<!\w)\(|(?<=\w\()/)
    .map((part) => part.split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0);

/**
 * Splits a command line into simple commands (word lists), in two readings. The first one takes
 * everything apart (see `split`), which cuts a command off from what follows a nested, escaped
 * or redirected part: `docker run -v $(pwd):/app --privileged`, `git commit -m "two\nlines" --amend`,
 * `find . \( -name a -o -name b \) -delete`, `find . 2>/dev/null -delete`. The second one
 * therefore goes level by level – the command line, then every part it nests – and reads each
 * deeper or escaped part as one plain argument (`_`), without redirections. Quotes and brackets
 * cannot be paired reliably without a parser (`# it's`), so it only ever adds to the first.
 * Message texts (see `TEXT`) are left out of both.
 */
export function segments(command: string): string[][] {
  command = command.replace(TEXT, "_");
  const levels = [
    command
      .replace(/\\(\w)|\\[^\r\n]/g, (_, letter) => letter ?? "_")
      .replace(/"[^"]*"|'[^']*'/g, (quoted) => quoted.replace(/[\r\n]+/g, " ")),
  ];
  // Every level hands on what it nests as a level of its own, innermost brackets first.
  for (let i = 0; i < levels.length; i++) {
    for (let before = "", depth = 0; before !== levels[i] && depth < DEPTH; depth++) {
      before = levels[i];
      levels[i] = before.replace(NESTED, (_, bracketed, ticked) => {
        levels.push(bracketed ?? ticked);
        return "_";
      });
    }
  }
  const second = levels.join("\n").replace(REDIRECT, " ");
  return second === command ? split(command) : [...split(command), ...split(second)];
}

/** First reason any matcher finds. Simple commands matching an `allowed` test are skipped. */
export function scan(
  command: string,
  matchers: Matcher[],
  allowed: ((text: string) => boolean)[] = [],
): string | undefined {
  for (const words of segments(command)) {
    const text = words.join(" ");
    if (allowed.some((allow) => allow(text))) continue;
    for (let i = 0; i < words.length; i++) {
      const w = words.slice(i, i + WINDOW);
      w[0] = w[0].replace(BIN_DIR, "");
      for (const matcher of matchers) {
        const reason = matcher(w, words[i], words[i - 1]);
        if (reason) return reason;
      }
    }
  }
  return undefined;
}
