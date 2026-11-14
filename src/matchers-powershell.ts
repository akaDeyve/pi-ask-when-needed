/**
 * PowerShell: the counterparts of the shell rules, for the `powershell` tool only (`iex` or `ri`
 * mean something else in Bash). PowerShell ignores case and accepts shortened parameters
 * (`-Recurse`, `-rec`, `-r`).
 */
import type { Matcher } from "./matcher-utils.ts";

/** Cmdlets and aliases that are dangerous however they are called: reason → commands. */
const ALWAYS = new Map(
  Object.entries({
    "executes dynamic code": ["invoke-expression", "iex"],
    "kills processes": ["stop-process", "spps", "taskkill"],
    "system services / autostart": ["stop-service", "set-service", "new-service", "register-scheduledtask", "schtasks"],
    "formats or wipes a disk": ["format-volume", "clear-disk", "diskpart"],
  }).flatMap(([reason, commands]) => commands.map((command) => [command, `${reason} (${command})`] as const)),
);
const always: Matcher = (w) => ALWAYS.get(w[0].toLowerCase());

const REMOVE = ["remove-item", "ri", "rm", "del", "erase", "rd", "rmdir"];
const removeItem: Matcher = (w) =>
  REMOVE.includes(w[0].toLowerCase()) && w.some((x) => /^-r[ecurs]*$/i.test(x)) ? "recursive deletion" : undefined;

const elevate: Matcher = (w) =>
  ["start-process", "saps", "start"].includes(w[0].toLowerCase()) && /\brunas\b/i.test(w.join(" "))
    ? "administrator privileges (Start-Process -Verb RunAs)"
    : undefined;

/** `Get-ChildItem Env:`, `dir env:`, `ls env:\` list every variable. */
const envDump: Matcher = (w) => (/^env:[/*]*$/i.test(w[0]) ? "reads environment variables (secrets)" : undefined);

export const POWERSHELL_MATCHERS: Matcher[] = [always, removeItem, elevate, envDump];
