/**
 * Decider contract: who decides about a dangerous action. Modes (index.ts) chain deciders.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Config } from "./config.ts";
import type { Danger } from "./detector.ts";

/** `terminate` also ends the agent's run (a headless run that keeps getting blocked). */
export type Verdict = { allow: true } | { allow: false; reason: string; terminate?: boolean };

/** Returns a verdict, or `undefined` to pass the decision on to the next decider of the mode. */
export type Decider = (danger: Danger, ctx: ExtensionContext, config: Config) => Promise<Verdict | undefined>;

/** A denial that also tells the model not to work around it. */
export const deny = (why: string): Verdict => ({
  allow: false,
  reason: `${why} Do not try to achieve the same thing by another route; ask the user how to proceed instead.`,
});
