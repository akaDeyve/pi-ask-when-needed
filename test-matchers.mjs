// Tests the REAL modular extension logic via import (Single-Source-of-Truth).
import path from "node:path";
import { checkBash, checkWrite, checkRead } from "./extensions/ask-when-needed/detector.ts";

let pass = 0, fail = 0;
function check(cmd, shouldBlock, cwd = "C:/projekt") {
  const d = checkBash({ command: cmd }, cwd);
  const blocked = d !== null;
  const ok = shouldBlock ? blocked : !blocked;
  console.log((ok ? "PASS" : "FAIL") + " | bash: " + cmd + " -> " + (d?.reason ?? "∅ (safe)") + (shouldBlock ? "" : "  [erwartet sicher]"));
  ok ? pass++ : fail++;
}
function checkWriteCase(p, shouldBlock, cwd = "C:/projekt") {
  const abs = path.resolve(cwd, p).split(path.sep).join("/");
  const d = checkWrite("write", { path: abs, content: "x" }, cwd);
  const blocked = d !== null;
  const ok = shouldBlock ? blocked : !blocked;
  console.log((ok ? "PASS" : "FAIL") + " | write: " + p + " -> " + (d?.reason ?? "∅ (safe)") + (shouldBlock ? "" : "  [erwartet sicher]"));
  ok ? pass++ : fail++;
}

// ── Bash-Detection ──
// Container-Escapes
check("docker run --privileged nginx", true);
check("docker run -v /:/host ubuntu", true);
check("docker run --network=host x", true);
check("docker run --pid=host x", true);
check("podman run -v /:/host x", true);
check("docker run -v /var/run/docker.sock:/sock x", true);
check("docker build -t app .", false);
check("docker ps", false);
// Disk/Filesystem
check("dd if=/dev/zero of=/dev/sda", true);
check("mkfs.ext4 /dev/sda", true);
check("fdisk /dev/sda", true);
check("parted /dev/sda", true);
check("wipefs /dev/sda", true);
check("blkdiscard /dev/sda", true);
// Permissions
check("chmod -R 777 /var", true);
check("chmod -R 755 /var", false);
check("chown -R user /var", true);
// Privilegien
check("sudo apt update", true);
check("sudo -E env", true);
check("doas cmd", true);
check("su root", true);
check("pkexec cmd", true);
// Secrets
check("printenv", true);
check("printenv | grep KEY", true);
check("env", true);
check("set", true);
check("env FOO=bar cmd", false); // Assignment, kein reiner Secret-Dump
check("eval $(base64 -d <<< e30=)", true);
check("base64 -d file", true);
check("base64 file", false);
// Git
check("git push origin main", true);
check("git push --force", true);
check("git push -f", true);
check("git reset --hard HEAD~1", true);
check("git clean -fd", true);
check("git branch -D feat", true);
check("git stash drop", true);
check("git checkout -- file", true);
check("git restore file", true);
check("git rebase main", true);
check("git commit --amend", true);
check("git status", false);
check("git commit -m x", false);
check("git add .", false);
// Publishing (network detection removed — Pi can fetch from the internet)
check("curl http://h", false);
check("npm publish", true);
check("cargo publish", true);
check("gh release create v1", true);
check("gem push pkg.gem", true);
check("twine upload dist/*", true);
check("npm run build", false);
// Deletion / mass deletion
check("rm -rf /tmp/x", true);
check("rm -r -f node_modules", true);
check("rm file.txt", false);
check("find . -delete", true);
check("find . -exec rm {} \\;", true);
check("xargs rm -rf < files.txt", true);
check("shred file", true);
check("truncate -s 0 file", true);
check("diskutil eraseDisk", true);
// Systemdienste/Prozesse
check("systemctl restart nginx", true);
check("crontab -e", true);
check("kill -9 1234", true);
check("pkill node", true);
// Command-Substitution
check("echo $(docker run --privileged x)", true);
check("echo `rm -rf /tmp`", true);
check("echo $(sudo ls)", true);
check("$(mkfs.ext4 /dev/sda)", true);
check("echo before $(git push) after", true);
check("VAR=$(printenv) ; echo $VAR", false); // Assignment, kein Execute
check("echo $(ls -la)", false);
check("echo $(npm run build)", false);

// ── Write-Detection (outside-path only on dangerous paths) ──
const cwd = process.platform === "win32" ? "C:\\projekt" : "/home/user/projekt";
// Dangerous system paths → block
if (process.platform === "win32") {
  checkWriteCase("C:\\Windows\\System32\\drivers\\etc\\hosts", true, cwd);
  checkWriteCase("C:\\Windows\\boot.ini", true, cwd);
} else {
  checkWriteCase("/etc/passwd", true, cwd);
  checkWriteCase("/etc/hosts", true, cwd);
  checkWriteCase("/usr/local/bin/script", true, cwd);
  checkWriteCase("/home/other/.ssh/authorized_keys", true, cwd);
  checkWriteCase("~/.aws/credentials", true, cwd);
}
// Normal paths outside → allowed
checkWriteCase("../sibling/file.txt", false, cwd);
checkWriteCase("/tmp/scratch.txt", false, cwd);
checkWriteCase("~/Documents/notes.md", false, cwd);
// Secrets & protected dirs → blockieren (auch innerhalb Projekt)
checkWriteCase(".env", true, cwd);
checkWriteCase("config/secret.pem", true, cwd);
checkWriteCase(".git/hooks/pre-commit", true, cwd);
checkWriteCase(".pi/settings.json", true, cwd);
checkWriteCase("src/index.ts", false, cwd);
checkWriteCase("README.md", false, cwd);

// ── Read-Detection (Secrets) ──
function checkReadCase(p, shouldBlock, cwd2 = cwd) {
  const abs = path.resolve(cwd2, p).split(path.sep).join("/");
  const d = checkRead("read", { path: abs }, cwd2);
  const blocked = d !== null;
  const ok = shouldBlock ? blocked : !blocked;
  console.log((ok ? "PASS" : "FAIL") + " | read: " + p + " -> " + (d?.reason ?? "∅ (safe)") + (shouldBlock ? "" : "  [erwartet sicher]"));
  ok ? pass++ : fail++;
}
checkReadCase(".env", true, cwd);
checkReadCase("~/.ssh/id_rsa", true, cwd);
checkReadCase("~/.aws/credentials", true, cwd);
checkReadCase("src/index.ts", false, cwd);
checkReadCase("README.md", false, cwd);
// Database files (secrets)
checkReadCase("data.db", true, cwd);
checkReadCase("db.sqlite", true, cwd);
checkReadCase("db.sqlite3", true, cwd);
checkReadCase("data.mdb", true, cwd);

console.log(`\n${pass}/${pass + fail} bestanden`);
process.exit(fail ? 1 : 0);
