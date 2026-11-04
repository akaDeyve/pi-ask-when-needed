/**
 * Network/exfiltration detection: uploads, pipe-to-shell, remote access.
 * (pi-guardrails does not cover this – ask-when-needed extension.)
 */
import { isOneOf, type Matcher } from "./matcher-utils.ts";

const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

export const netMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (cmd === "curl" || cmd === "wget") {
    if (w.some((x) => x === "-d" || x.startsWith("--data") || x === "-F" || x.startsWith("--form") || x === "-T" || x === "--upload-file"))
      return "sends data to the network (upload)";
    // Pipe-to-shell: the tokenizer removes '|', so we check whether a shell
    // interpreter directly follows the URL/options (word sequence "... sh/bash").
    for (let i = 1; i < w.length; i++) {
      const tok = w[i];
      if (tok === "|" || tok === "||") {
        const next = w[i + 1];
        if (next && (SHELLS.has(next) || next.startsWith("bash") || next.startsWith("sh"))) return "downloads and runs a script (pipe to shell)";
      }
      if (SHELLS.has(tok) || tok.startsWith("bash") || tok.startsWith("sh")) return "downloads and runs a script (pipe to shell)";
    }
  }
  if (isOneOf(w, "nc", "ncat", "netcat", "socat")) return "network tool (nc/socat)";
  if (isOneOf(w, "ssh", "scp", "sftp", "rsync")) return "access to other machines";
  return undefined;
};

export const NETWORK_MATCHERS: Matcher[] = [netMatcher];
