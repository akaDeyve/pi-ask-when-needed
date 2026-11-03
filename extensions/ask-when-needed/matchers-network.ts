/**
 * Netzwerk-/Exfiltrations-Detection: Uploads, Pipe-to-shell, Remote-Zugriff.
 * (pi-guardrails deckt das nicht ab – ask-when-needed Erweiterung.)
 */
import { isOneOf, type Matcher } from "./matcher-utils.ts";

const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);

export const netMatcher: Matcher = (w) => {
  const cmd = w[0] ?? "";
  if (cmd === "curl" || cmd === "wget") {
    if (w.some((x) => x === "-d" || x.startsWith("--data") || x === "-F" || x.startsWith("--form") || x === "-T" || x === "--upload-file"))
      return "sendet Daten ins Netz (Upload)";
    // Pipe-to-shell: Der Tokenizer entfernt '|', daher prüfen wir, ob nach der
    // URL/Optionen ein Shell-Interpreter direkt folgt (Wortfolge "... sh/bash").
    for (let i = 1; i < w.length; i++) {
      const tok = w[i];
      if (tok === "|" || tok === "||") {
        const next = w[i + 1];
        if (next && (SHELLS.has(next) || next.startsWith("bash") || next.startsWith("sh"))) return "lädt Script und führt es aus (pipe to shell)";
      }
      if (SHELLS.has(tok) || tok.startsWith("bash") || tok.startsWith("sh")) return "lädt Script und führt es aus (pipe to shell)";
    }
  }
  if (isOneOf(w, "nc", "ncat", "netcat", "socat")) return "Netzwerk-Tool (nc/socat)";
  if (isOneOf(w, "ssh", "scp", "sftp", "rsync")) return "Zugriff auf andere Rechner";
  return undefined;
};

export const NETWORK_MATCHERS: Matcher[] = [netMatcher];
