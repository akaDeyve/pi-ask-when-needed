/**
 * Git detection: destructive history/remote operations.
 * (pi-guardrails does not cover this – ask-when-needed extension.)
 */
import { hasFlag, type Matcher } from "./matcher-utils.ts";

export const gitMatcher: Matcher = (w) => {
  if (w[0] !== "git") return undefined;
  const sub = w[1] ?? "";
  if (sub === "push") return w.some((x) => x === "--force" || x === "-f") ? "Force-Push" : "Push to remote repository";
  if (sub === "reset" && w[2] === "--hard") return "discards local changes (git reset --hard)";
  if (sub === "clean" && hasFlag(w, "f")) return "discards untracked files (git clean -f)";
  if (sub === "checkout" && w[2] === "--") return "discards changes (git checkout --)";
  if (sub === "restore") return "discards changes (git restore)";
  if (sub === "branch" && hasFlag(w, "D")) return "force-deletes branch (git branch -D)";
  if (sub === "stash" && (w[2] === "drop" || w[2] === "clear")) return "discards stash";
  if (["filter-branch", "filter-repo", "rebase"].includes(sub)) return "rewrites git history";
  if (sub === "commit" && w.includes("--amend")) return "amends last commit (--amend)";
  return undefined;
};

export const GIT_MATCHERS: Matcher[] = [gitMatcher];
