/**
 * Git-Detection: destruktive History-/Remote-Operationen.
 * (pi-guardrails deckt das nicht ab – ask-when-needed Erweiterung.)
 */
import { hasShortFlag, type Matcher } from "./matcher-utils.ts";

export const gitMatcher: Matcher = (w) => {
  if (w[0] !== "git") return undefined;
  const sub = w[1] ?? "";
  if (sub === "push") return w.some((x) => x === "--force" || x === "-f") ? "Force-Push" : "Push ins Remote-Repository";
  if (sub === "reset" && w[2] === "--hard") return "verwirft lokale Änderungen (git reset --hard)";
  if (sub === "clean" && hasShortFlag(w, "f")) return "verwirft untracked Dateien (git clean -f)";
  if (sub === "checkout" && w[2] === "--") return "verwirft Änderungen (git checkout --)";
  if (sub === "restore") return "verwirft Änderungen (git restore)";
  if (sub === "branch" && hasShortFlag(w, "D")) return "löscht Branch hart (git branch -D)";
  if (sub === "stash" && (w[2] === "drop" || w[2] === "clear")) return "verwirft Stash";
  if (["filter-branch", "filter-repo", "rebase"].includes(sub)) return "schreibt Git-History um";
  if (sub === "commit" && w.includes("--amend")) return "ändert letzten Commit (--amend)";
  return undefined;
};

export const GIT_MATCHERS: Matcher[] = [gitMatcher];
