/**
 * Shell/system commands: deletion, privileges, disk/filesystem,
 * permission changes, container escapes, services/processes.
 */
import { hasFlag, type Matcher } from "./matcher-utils.ts";

/** Commands that are dangerous however they are called: reason → commands. */
const ALWAYS = new Map(
  Object.entries({
    "secure overwrite": ["shred"],
    "overwrite file/disk": ["truncate", "wipefs", "diskutil"],
    "root privileges": ["doas", "pkexec"],
    "user switch": ["su"],
    "discard block device": ["blkdiscard"],
    "disk partitioning": ["fdisk", "sfdisk", "cfdisk", "parted", "sgdisk"],
    "system services / autostart": ["crontab", "systemctl", "launchctl"],
    "kills processes": ["kill", "killall", "pkill"],
  }).flatMap(([reason, commands]) => commands.map((command) => [command, `${reason} (${command})`] as const)),
);
const always: Matcher = (w) => ALWAYS.get(w[0]);

// ─ File/directory destruction (`git rm` is a Git matter: Git keeps what it removes) ─
const rm: Matcher = (w, _raw, before) =>
  w[0] !== "rm" || before === "git" || !hasFlag(w, "rR", "recursive")
    ? undefined
    : hasFlag(w, "f", "force")
      ? "force recursive deletion"
      : "recursive deletion";

const massDelete: Matcher = (w) => {
  if (w[0] === "xargs") return w.includes("rm") ? "mass deletion (xargs rm)" : undefined;
  if (w[0] !== "find") return undefined;
  if (w.includes("-delete")) return "mass deletion (find -delete)";
  const exec = w.findIndex((x) => x === "-exec" || x === "-execdir");
  return exec !== -1 && w.includes("rm", exec) ? "mass deletion (find -exec rm)" : undefined;
};

// ─ Privileges ─
const sudo: Matcher = (w) =>
  w[0] !== "sudo"
    ? undefined
    : w.includes("-E")
      ? "root privileges (sudo -E, environment/secrets)"
      : "root privileges (sudo)";

// ─ Disk/filesystem ─
const dd: Matcher = (w) =>
  w[0] === "dd" && w.some((x) => x.startsWith("of=")) ? "disk write access (dd of=)" : undefined;
const mkfs: Matcher = (w) => (/^mkfs(\.|$)/.test(w[0]) ? "format filesystem" : undefined);

// ─ Permission changes (only 777-style recursive, like pi-guardrails) ─
const WORLD_WRITABLE = ["777", "0777", "a+rwx", "ugo+rwx", "7777", "1777"];
const chmod: Matcher = (w) =>
  w[0] === "chmod" && hasFlag(w, "R", "recursive") && w.some((x) => WORLD_WRITABLE.includes(x))
    ? "insecure recursive permissions (chmod -R 777)"
    : undefined;
const chown: Matcher = (w) =>
  w[0] === "chown" && hasFlag(w, "R", "recursive") ? "recursive owner change" : undefined;

// ─ Container escapes ─
const container: Matcher = (w) => {
  if ((w[0] !== "docker" && w[0] !== "podman") || !w.some((x) => x === "run" || x === "create")) return undefined;
  const args = w.join(" ");
  if (/ --privileged\b/.test(args)) return "privileged container";
  const host = / --(pid|net|network|userns|uts|ipc)[= ]host\b/.exec(args);
  if (host) return `container with host ${host[1]} namespace`;
  if (/ (-v|--volume)[= ]?\/:/.test(args) || / --mount[= ]\S*\b(source|src)=\/(,|\s|$)/.test(args))
    return "container with root filesystem mount";
  if (/(docker|podman)\.sock/.test(args)) return "container with Docker socket";
  return undefined;
};

export const SHELL_MATCHERS: Matcher[] = [always, rm, massDelete, sudo, dd, mkfs, chmod, chown, container];
