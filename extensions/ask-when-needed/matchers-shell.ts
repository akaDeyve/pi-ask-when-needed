/**
 * Shell-/System-Kommandos: Löschen, Privilegien, Disk/Filesystem,
 * Rechteänderungen, Container-Escapes, Dienste/Prozesse.
 */
import { hasArg, hasShortFlag, hasLongOption, isOneOf, type Matcher } from "./matcher-utils.ts";

// ─ Datei-/Verzeichnis-Zerstörung ─
export const rmMatcher: Matcher = (w) => {
  if (w[0] !== "rm" && w[0] !== "xargs") return undefined;
  if (w[0] === "xargs") return w.includes("rm") ? "Massenlöschung (xargs rm)" : undefined;
  const recursive =
    hasShortFlag(w, "r") || hasShortFlag(w, "R") || hasLongOption(w, "recursive") || hasLongOption(w, "dir");
  const force = hasShortFlag(w, "f") || hasLongOption(w, "force");
  return recursive && force ? "rekursives Löschen erzwingen" : undefined;
};

export const massDeleteMatcher: Matcher = (w) => {
  if (w[0] === "find") {
    const execIdx = w.indexOf("-exec");
    if (hasLongOption(w, "delete") || w.includes("-delete")) return "Massenlöschung (find -delete)";
    if (execIdx !== -1 && w.slice(execIdx).includes("rm")) return "Massenlöschung (find -exec rm)";
  }
  return undefined;
};

export const shredMatcher: Matcher = (w) =>
  w[0] === "shred" ? "sicheres Überschreiben (shred)" : undefined;

export const overwriteMatcher: Matcher = (w) =>
  isOneOf(w, "truncate", "wipefs", "diskutil") ? "Datei/Datenträger überschreiben" : undefined;

// ─ Privilegien ─
export const sudoMatcher: Matcher = (w) =>
  w[0] === "sudo"
    ? w.includes("-E")
      ? "Root-Rechte (sudo -E, Umgebung/Secrets)"
      : "Root-Rechte (sudo)"
    : undefined;
export const doasMatcher: Matcher = (w) => (w[0] === "doas" ? "Root-Rechte (doas)" : undefined);
export const suMatcher: Matcher = (w) => (w[0] === "su" ? "Benutzerwechsel (su)" : undefined);
export const pkexecMatcher: Matcher = (w) => (w[0] === "pkexec" ? "Root-Rechte (pkexec)" : undefined);

// ─ Disk/Dateisystem ─
export const ddMatcher: Matcher = (w) =>
  w[0] === "dd" && hasArg(w, "of=") ? "Disk-Schreibzugriff (dd of=)" : undefined;
export const mkfsMatcher: Matcher = (w) =>
  w[0] === "mkfs" || w[0]?.startsWith("mkfs.") ? "Dateisystem formatieren" : undefined;
export const blkdiscardMatcher: Matcher = (w) =>
  w[0] === "blkdiscard" ? "Blockgerät verwerfen" : undefined;
export const fdiskMatcher: Matcher = (w) =>
  isOneOf(w, "fdisk", "sfdisk", "cfdisk") ? "Disk-Partitionierung" : undefined;
export const partedMatcher: Matcher = (w) =>
  isOneOf(w, "parted", "sgdisk") ? "Disk-Partitionierung" : undefined;

// ─ Rechteänderung (nur 777-style rekursiv, wie pi-guardrails) ─
export const chmodMatcher: Matcher = (w) => {
  if (w[0] !== "chmod") return undefined;
  const recursive = hasShortFlag(w, "R") || hasLongOption(w, "recursive");
  const worldWritable = w.some((x) => ["777", "0777", "a+rwx", "ugo+rwx", "7777", "1777"].includes(x));
  return recursive && worldWritable ? "unsichere rekursive Rechte (chmod -R 777)" : undefined;
};
export const chownMatcher: Matcher = (w) =>
  w[0] === "chown" && (hasShortFlag(w, "R") || hasLongOption(w, "recursive"))
    ? "rekursive Besitzeränderung"
    : undefined;

// ─ Container-Escapes ─
export const containerMatcher: Matcher = (w) => {
  const cmd = w[0];
  if (!cmd || (cmd !== "docker" && cmd !== "podman")) return undefined;
  const sub = w[1];
  if (sub !== "run" && sub !== "create") return undefined;
  if (w.some((x) => x === "--privileged" || x.startsWith("--privileged="))) return "privilegierter Container";
  if (w.some((x) => x === "--pid=host" || x.startsWith("--pid=host"))) return "Container mit Host-PID-Namespace";
  if (w.some((x) => x === "--network=host" || x.startsWith("--network=host"))) return "Container mit Host-Netzwerk";
  if (w.some((x) => x === "--userns=host" || x.startsWith("--userns=host"))) return "Container mit Host-Userns";
  if (w.some((x) => x === "--uts=host" || x.startsWith("--uts=host"))) return "Container mit Host-UTS";
  if (w.some((x) => x === "--ipc=host" || x.startsWith("--ipc=host"))) return "Container mit Host-IPC";
  // Root-Mount: "-v /:/host" wird vom Tokenizer zu ["-v","/","/host"], daher das Argumentpaar prüfen.
  for (let i = 0; i < w.length; i++) {
    const word = w[i];
    const next = w[i + 1] ?? "";
    if (/^(-v|--volume)$/i.test(word) && (next.startsWith("/:") || next === "/")) return "Container mit Root-Filesystem-Mount";
    if (word.startsWith("--volume=/:") || word.startsWith("--mount=type=bind,source=/,")) return "Container mit Root-Filesystem-Mount";
    if (word.includes("/var/run/docker.sock") || word.includes("/run/docker.sock") || word.includes("/var/run/podman.sock") || word.includes("/run/podman.sock")) return "Container mit Docker-Socket";
  }
  return undefined;
};

// ─ Systemdienste / Prozesse ─
export const serviceMatcher: Matcher = (w) =>
  isOneOf(w, "crontab", "systemctl", "launchctl") ? "Systemdienste / Autostart" : undefined;
export const killMatcher: Matcher = (w) =>
  isOneOf(w, "kill", "killall", "pkill") ? "beendet Prozesse" : undefined;

// ─ Kompilierte Liste (Shell-/System-Detection) ─
export const SHELL_MATCHERS: Matcher[] = [
  rmMatcher,
  shredMatcher,
  massDeleteMatcher,
  overwriteMatcher,
  sudoMatcher,
  doasMatcher,
  suMatcher,
  pkexecMatcher,
  ddMatcher,
  mkfsMatcher,
  overwriteMatcher, // wipefs/diskutil
  blkdiscardMatcher,
  fdiskMatcher,
  partedMatcher,
  chmodMatcher,
  chownMatcher,
  containerMatcher,
  serviceMatcher,
  killMatcher,
];
