/**
 * Shell/system commands: deletion, privileges, disk/filesystem,
 * permission changes, container escapes, services/processes.
 */
import { hasArg, hasShortFlag, hasLongOption, isOneOf, type Matcher } from "./matcher-utils.ts";

// ─ File/directory destruction ─
export const rmMatcher: Matcher = (w) => {
  if (w[0] !== "rm" && w[0] !== "xargs") return undefined;
  if (w[0] === "xargs") return w.includes("rm") ? "mass deletion (xargs rm)" : undefined;
  const recursive =
    hasShortFlag(w, "r") || hasShortFlag(w, "R") || hasLongOption(w, "recursive") || hasLongOption(w, "dir");
  const force = hasShortFlag(w, "f") || hasLongOption(w, "force");
  return recursive && force ? "force recursive deletion" : undefined;
};

export const massDeleteMatcher: Matcher = (w) => {
  if (w[0] === "find") {
    const execIdx = w.indexOf("-exec");
    if (hasLongOption(w, "delete") || w.includes("-delete")) return "mass deletion (find -delete)";
    if (execIdx !== -1 && w.slice(execIdx).includes("rm")) return "mass deletion (find -exec rm)";
  }
  return undefined;
};

export const shredMatcher: Matcher = (w) =>
  w[0] === "shred" ? "secure overwrite (shred)" : undefined;

export const overwriteMatcher: Matcher = (w) =>
  isOneOf(w, "truncate", "wipefs", "diskutil") ? "overwrite file/disk" : undefined;

// ─ Privileges ─
export const sudoMatcher: Matcher = (w) =>
  w[0] === "sudo"
    ? w.includes("-E")
      ? "root privileges (sudo -E, environment/secrets)"
      : "root privileges (sudo)"
    : undefined;
export const doasMatcher: Matcher = (w) => (w[0] === "doas" ? "root privileges (doas)" : undefined);
export const suMatcher: Matcher = (w) => (w[0] === "su" ? "user switch (su)" : undefined);
export const pkexecMatcher: Matcher = (w) => (w[0] === "pkexec" ? "root privileges (pkexec)" : undefined);

// ─ Disk/filesystem ─
export const ddMatcher: Matcher = (w) =>
  w[0] === "dd" && hasArg(w, "of=") ? "disk write access (dd of=)" : undefined;
export const mkfsMatcher: Matcher = (w) =>
  w[0] === "mkfs" || w[0]?.startsWith("mkfs.") ? "format filesystem" : undefined;
export const blkdiscardMatcher: Matcher = (w) =>
  w[0] === "blkdiscard" ? "discard block device" : undefined;
export const fdiskMatcher: Matcher = (w) =>
  isOneOf(w, "fdisk", "sfdisk", "cfdisk") ? "disk partitioning" : undefined;
export const partedMatcher: Matcher = (w) =>
  isOneOf(w, "parted", "sgdisk") ? "disk partitioning" : undefined;

// ─ Permission changes (only 777-style recursive, like pi-guardrails) ─
export const chmodMatcher: Matcher = (w) => {
  if (w[0] !== "chmod") return undefined;
  const recursive = hasShortFlag(w, "R") || hasLongOption(w, "recursive");
  const worldWritable = w.some((x) => ["777", "0777", "a+rwx", "ugo+rwx", "7777", "1777"].includes(x));
  return recursive && worldWritable ? "insecure recursive permissions (chmod -R 777)" : undefined;
};
export const chownMatcher: Matcher = (w) =>
  w[0] === "chown" && (hasShortFlag(w, "R") || hasLongOption(w, "recursive"))
    ? "recursive owner change"
    : undefined;

// ─ Container escapes ─
export const containerMatcher: Matcher = (w) => {
  const cmd = w[0];
  if (!cmd || (cmd !== "docker" && cmd !== "podman")) return undefined;
  const sub = w[1];
  if (sub !== "run" && sub !== "create") return undefined;
  if (w.some((x) => x === "--privileged" || x.startsWith("--privileged="))) return "privileged container";
  if (w.some((x) => x === "--pid=host" || x.startsWith("--pid=host"))) return "container with host PID namespace";
  if (w.some((x) => x === "--network=host" || x.startsWith("--network=host"))) return "container with host network";
  if (w.some((x) => x === "--userns=host" || x.startsWith("--userns=host"))) return "container with host userns";
  if (w.some((x) => x === "--uts=host" || x.startsWith("--uts=host"))) return "container with host UTS";
  if (w.some((x) => x === "--ipc=host" || x.startsWith("--ipc=host"))) return "container with host IPC";
  // Root mount: "-v /:/host" is tokenized into ["-v","/","/host"], so check the argument pair.
  for (let i = 0; i < w.length; i++) {
    const word = w[i];
    const next = w[i + 1] ?? "";
    if (/^(-v|--volume)$/i.test(word) && (next.startsWith("/:") || next === "/")) return "container with root filesystem mount";
    if (word.startsWith("--volume=/:") || word.startsWith("--mount=type=bind,source=/,")) return "container with root filesystem mount";
    if (word.includes("/var/run/docker.sock") || word.includes("/run/docker.sock") || word.includes("/var/run/podman.sock") || word.includes("/run/podman.sock")) return "container with Docker socket";
  }
  return undefined;
};

// ─ System services / processes ─
export const serviceMatcher: Matcher = (w) =>
  isOneOf(w, "crontab", "systemctl", "launchctl") ? "system services / autostart" : undefined;
export const killMatcher: Matcher = (w) =>
  isOneOf(w, "kill", "killall", "pkill") ? "kills processes" : undefined;

// ─ Compiled list (shell/system detection) ─
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
