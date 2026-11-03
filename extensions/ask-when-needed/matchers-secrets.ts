/**
 * Secret-Detection: Umgebungsvariablen auslesen, verschleierter Code.
 * Datei-/Pfad-Policies (SECRET_FILE, PROTECTED_DIR, DANGEROUS_OUTSIDE) liegen in paths.ts.
 */
import type { Matcher } from "./matcher-utils.ts";

export const printenvMatcher: Matcher = (w) =>
  w[0] === "printenv" || (w[0] === "env" && w.length === 1) || (w[0] === "set" && w.length === 1)
    ? "liest Umgebungsvariablen (Secrets)"
    : undefined;

export const obfuscationMatcher: Matcher = (w) => {
  if (w[0] === "eval") return "führt dynamischen Code aus (eval)";
  if (w[0] === "base64" && (w.includes("--decode") || w.includes("-d"))) return "dekodiert verschleierten Code (base64 -d)";
  return undefined;
};

export const SECRET_MATCHERS: Matcher[] = [printenvMatcher, obfuscationMatcher];
