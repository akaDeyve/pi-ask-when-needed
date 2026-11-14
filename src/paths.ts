/**
 * Path helpers: resolving tool paths the way Pi does, and glob matching for path rules.
 * Paths are compared with forward slashes on every platform, so rules only ever need `/`.
 */
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const slash = (p: string) => p.replace(/\\/g, "/");
const expandHome = (p: string) => p.replace(/^~(?=$|[\\/])/, () => os.homedir());

/**
 * Globs → one case-insensitive RegExp, anchored at path-component boundaries: `*.pem` and `.ssh`
 * match at any depth (a matching directory covers everything below it), `/etc` and `~/.config`
 * only at that exact location. `*` never crosses a `/`.
 */
export function globs(patterns: string[] = []): RegExp {
  const sources = patterns.filter(Boolean).map((pattern) =>
    slash(expandHome(pattern))
      .replace(/\/+$/, "")
      .replace(/[.+?^${}()|[\]]/g, "\\$&")
      .replace(/\*+/g, "[^/]*"),
  );
  return new RegExp(sources.length ? `(^|/)(${sources.join("|")})(/|$)` : "(?!)", "i");
}

/** Absolute path of a tool's `path` argument, resolved like Pi resolves it (`@` prefix, `~`, `file://`). */
export function resolvePath(cwd: string, value: unknown): string {
  const raw = String(value ?? ".").replace(/^@/, "");
  return slash(path.resolve(cwd, raw.startsWith("file://") ? fileURLToPath(raw) : expandHome(raw)));
}

export function isInside(dir: string, file: string): boolean {
  const root = slash(dir).replace(/\/?$/, "/");
  return `${file}/`.startsWith(root);
}

export function displayPath(cwd: string, file: string): string {
  return isInside(cwd, file) ? path.posix.relative(slash(cwd), file) || "." : file;
}
