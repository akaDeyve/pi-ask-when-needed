/**
 * Publish detection: releases/uploads to registries & hosts.
 * (pi-guardrails does not cover this – ask-when-needed extension.)
 */
import type { Matcher } from "./matcher-utils.ts";

/** command → [subcommand, target] */
const PUBLISH = new Map<string, [string, string]>([
  ["npm", ["publish", "package registry"]],
  ["pnpm", ["publish", "package registry"]],
  ["yarn", ["publish", "package registry"]],
  ["cargo", ["publish", "crates.io"]],
  ["twine", ["upload", "PyPI"]],
  ["gem", ["push", "RubyGems"]],
  ["gh", ["release", "GitHub release"]],
]);

const publish: Matcher = (w) => {
  const [sub, target] = PUBLISH.get(w[0]) ?? [];
  return sub && w[1] === sub ? `Publishing (${target})` : undefined;
};

export const PUBLISH_MATCHERS: Matcher[] = [publish];
