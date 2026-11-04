/**
 * Publish detection: releases/uploads to registries & hosts.
 * (pi-guardrails does not cover this – ask-when-needed extension.)
 */
import { isOneOf, type Matcher } from "./matcher-utils.ts";

export const publishMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (isOneOf(w, "npm", "pnpm", "yarn") && w[1] === "publish") return "Publishing (package registry)";
  if (cmd === "cargo" && w[1] === "publish") return "Publishing (crates.io)";
  if (cmd === "twine" && w[1] === "upload") return "Publishing (PyPI)";
  if (cmd === "gem" && w[1] === "push") return "Publishing (RubyGems)";
  if (cmd === "gh" && w[1] === "release") return "Publishing (GitHub release)";
  return undefined;
};

export const PUBLISH_MATCHERS: Matcher[] = [publishMatcher];
