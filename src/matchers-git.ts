/**
 * Git detection: destructive history/remote operations.
 * (pi-guardrails does not cover this – ask-when-needed extension.)
 */
import { hasFlag, type Matcher } from "./matcher-utils.ts";

const git: Matcher = (w) => {
  if (w[0] !== "git") return undefined;
  // Skip global options (`git -C dir push`, `git --no-pager …`) to find the subcommand.
  let i = 1;
  while (w[i]?.startsWith("-")) i += w[i] === "-C" || w[i] === "-c" ? 2 : 1;
  const [sub, ...args] = w.slice(i);

  if (sub === "push") return hasFlag(args, "f", "force") ? "Force-Push" : "Push to remote repository";
  if (sub === "reset" && args.includes("--hard")) return "discards local changes (git reset --hard)";
  if (sub === "clean" && hasFlag(args, "f", "force")) return "discards untracked files (git clean -f)";
  if (sub === "rm" && hasFlag(args, "f", "force")) return "discards changes (git rm -f)";
  if (sub === "checkout" && (args.includes("--") || args.includes(".") || hasFlag(args, "f", "force")))
    return "discards changes (git checkout)";
  // `--staged` alone only unstages; anything touching the working tree discards changes.
  if (sub === "restore" && (!hasFlag(args, "S", "staged") || hasFlag(args, "W", "worktree")))
    return "discards changes (git restore)";
  if (sub === "branch" && hasFlag(args, "D")) return "force-deletes branch (git branch -D)";
  if (sub === "stash" && (args[0] === "drop" || args[0] === "clear")) return "discards stash";
  if (sub === "filter-branch" || sub === "filter-repo" || sub === "rebase") return "rewrites git history";
  if (sub === "commit" && args.includes("--amend")) return "amends last commit (--amend)";
  return undefined;
};

export const GIT_MATCHERS: Matcher[] = [git];
