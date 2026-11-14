/**
 * Secret detection in commands: dumping environment variables, obfuscated code.
 * Secret files are path policies (config.ts) and apply to commands as well.
 */
import { hasFlag, type Matcher } from "./matcher-utils.ts";

const envDump: Matcher = (w) =>
  w[0] === "printenv" || ((w[0] === "env" || w[0] === "set") && w.length === 1)
    ? "reads environment variables (secrets)"
    : undefined;

const obfuscation: Matcher = (w) => {
  if (w[0] === "eval") return "executes dynamic code (eval)";
  if (w[0] === "base64" && hasFlag(w, "dD", "decode")) return "decodes obfuscated code (base64 -d)";
  return undefined;
};

export const SECRET_MATCHERS: Matcher[] = [envDump, obfuscation];
