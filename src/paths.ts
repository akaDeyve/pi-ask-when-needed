/**
 * File and path policies.
 *
 * - SECRET_FILE: Files that may contain secrets (reading+writing is dangerous).
 * - PROTECTED_DIR: Directories where writing can execute or modify code.
 * - DANGEROUS_OUTSIDE: Dangerous system paths. "Write outside project" is only
 *   triggered when the target is listed here — normal paths outside remain allowed.
 */
import * as os from "node:os";
import * as path from "node:path";

export const READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
export const WRITE_TOOLS = new Set(["edit", "write"]);

/** Files that may contain secrets (both reading AND writing is considered dangerous). */
export const SECRET_FILE =
  /(^|\/)\.(ssh|aws|gnupg|kube|docker|netrc)(\/|$)|(^|\/)\.env(\.[\w-]+)?$|(^|\/)\.dev\.vars$|\.(pem|key|p12)$|(^|\/)id_(rsa|ed25519|ecdsa)$|credentials|\.gpg$|\.(db|sqlite|sqlite3|mdb)$/i;

/** Writing here can execute code or modify Pi itself (Git hooks, extensions). */
export const PROTECTED_DIR = /(^|\/)\.(git|pi)(\/|$)/;

/** Dangerous system paths (Linux/macOS + Windows). Writing here prompts for confirmation. */
const DANGEROUS_OUTSIDE = [
  // Linux/macOS
  /^\/(etc|bin|sbin|boot|root|sys|proc|dev|lib|lib64|usr|var)\b/i,
  /^\/home\/[^/]+\/\.(ssh|aws|gnupg|config|kube|docker|npm|netrc)/i,
  /^~\/\.(ssh|aws|gnupg|config|kube|docker|npm|netrc)/i,
  // Windows
  /^[a-zA-Z]:\\(windows|winnt|system32|syswow64)\b/i,
  /^[a-zA-Z]:\\users\\[^\\]+\\\.(ssh|aws|gnupg|config|kube|docker|npm)/i,
  /\\(system32|syswow64|windows|winnt)\\/i,
];

export function isDangerousOutside(file: string): boolean {
  const normalized = file.replace(/[/\\]+/g, path.sep === "\\" ? "\\" : "/");
  return DANGEROUS_OUTSIDE.some((re) => re.test(normalized) || re.test(file));
}

export function resolvePath(cwd: string, value: unknown): string {
  const raw = String(value ?? ".");
  const expanded = raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
  return path.resolve(cwd, expanded);
}

export function isInside(cwd: string, file: string): boolean {
  return file === cwd || file.startsWith(cwd + path.sep);
}

export function displayPath(cwd: string, file: string): string {
  return isInside(cwd, file) ? path.relative(cwd, file) || "." : file;
}
