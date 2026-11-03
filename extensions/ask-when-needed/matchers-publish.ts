/**
 * Publishing-Detection: Releases/Uploads zu Registries & Hosts.
 * (pi-guardrails deckt das nicht ab – ask-when-needed Erweiterung.)
 */
import { isOneOf, type Matcher } from "./matcher-utils.ts";

export const publishMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (isOneOf(w, "npm", "pnpm", "yarn") && w[1] === "publish") return "Veröffentlichung (Package-Registry)";
  if (cmd === "cargo" && w[1] === "publish") return "Veröffentlichung (crates.io)";
  if (cmd === "twine" && w[1] === "upload") return "Veröffentlichung (PyPI)";
  if (cmd === "gem" && w[1] === "push") return "Veröffentlichung (RubyGems)";
  if (cmd === "gh" && w[1] === "release") return "Veröffentlichung (GitHub Release)";
  return undefined;
};

export const PUBLISH_MATCHERS: Matcher[] = [publishMatcher];
