/**
 * Secret detection: reading environment variables, obfuscated code.
 * File/path policies (SECRET_FILE, PROTECTED_DIR, DANGEROUS_OUTSIDE) live in paths.ts.
 */
import type { Matcher } from "./matcher-utils.ts";

export const printenvMatcher: Matcher = (w) =>
  w[0] === "printenv" || (w[0] === "env" && w.length === 1) || (w[0] === "set" && w.length === 1)
    ? "reads environment variables (secrets)"
    : undefined;

export const obfuscationMatcher: Matcher = (w) => {
  if (w[0] === "eval") return "executes dynamic code (eval)";
  if (w[0] === "base64" && (w.includes("--decode") || w.includes("-d"))) return "decodes obfuscated code (base64 -d)";
  return undefined;
};

export const SECRET_MATCHERS: Matcher[] = [printenvMatcher, obfuscationMatcher];
