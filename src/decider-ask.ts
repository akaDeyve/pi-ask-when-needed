/**
 * Ask mode: the user decides in an interactive prompt.
 */
import { deny, type Decider } from "./decider.ts";

// "No" is listed first so that an accidental Enter never approves anything dangerous.
const CHOICE = {
  reject: "No",
  approve: "Yes, run it",
  rejectWithHint: "No, with a hint to Pi ...",
} as const;

export const ask: Decider = async (danger, ctx) => {
  if (!ctx.hasUI) return undefined;
  const choice = await ctx.ui.select(`⚠️  ${danger.reason}\n\n${danger.preview}`, Object.values(CHOICE), {
    signal: ctx.signal,
  });
  if (choice === CHOICE.approve) return { allow: true };
  if (choice === CHOICE.rejectWithHint) {
    const hint = (await ctx.ui.input("Hint for Pi", 'e.g. "only delete the build folder"'))?.trim();
    if (hint) return { allow: false, reason: `Rejected by the user. User's hint: ${hint}` };
  }
  return deny("Rejected by the user.");
};
