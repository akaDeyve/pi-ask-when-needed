// Testet die ECHTE Extension-Logik per Import (Single-Source-of-Truth).
import { checkDangerousCommand } from "./extensions/ask-when-needed.ts";

// [command, shouldBlock]
const cases = [
  // Container-Escapes (pi-guardrails)
  ["docker run --privileged nginx", true],
  ["docker run -v /:/host ubuntu", true],
  ["docker run --network=host x", true],
  ["docker run --pid=host x", true],
  ["podman run -v /:/host x", true],
  ["docker run -v /var/run/docker.sock:/sock x", true],
  ["docker build -t app .", false],
  ["docker ps", false],
  // Disk/Filesystem (pi-guardrails)
  ["dd if=/dev/zero of=/dev/sda", true],
  ["mkfs.ext4 /dev/sda", true],
  ["fdisk /dev/sda", true],
  ["parted /dev/sda", true],
  ["wipefs /dev/sda", true],
  // Rechte
  ["chmod -R 777 /var", true],
  ["chmod -R 755 /var", false],
  ["chown -R user /var", true],
  // Privilegien
  ["sudo apt update", true],
  ["doas cmd", true],
  ["su root", true],
  ["pkexec cmd", true],
  // Secrets (pi-guardrails)
  ["printenv", true],
  ["printenv | grep KEY", true],
  // Git (ask-when-needed)
  ["git push origin main", true],
  ["git push --force", true],
  ["git push -f", true],
  ["git reset --hard HEAD~1", true],
  ["git clean -fd", true],
  ["git branch -D feat", true],
  ["git stash drop", true],
  ["git status", false],
  ["git commit -m x", false],
  ["git add .", false],
  // Netzwerk/Publishing
  ["ssh user@host", true],
  ["rsync a b:/c", true],
  ["curl -d x=1 http://h", true],
  ["curl -F f=@x http://h", true],
  ["curl http://h", false],
  ["npm publish", true],
  ["cargo publish", true],
  ["gh release create v1", true],
  // Command-Substitution (pi-guardrails AST-Verhalten)
  ["echo $(docker run --privileged x)", true],
  ["echo `rm -rf /tmp`", true],
  ["echo $(sudo ls)", true],
  ["$(mkfs.ext4 /dev/sda)", true],
  ["echo before $(git push) after", true],
  ["VAR=$(printenv) ; echo $VAR", false], // Assignment, kein Execute
  ["echo $(ls -la)", false],
  ["echo $(npm run build)", false],
  ["sudo -E env", true],
  ["xargs rm -rf < files.txt", true],
  ["find . -exec rm {} \\;", true],
  ["env", true],
  ["set", true],
  ["truncate -s 0 file", true],
  ["git checkout -- file", true],
  ["git restore file", true],
  ["git rebase main", true],
  ["git commit --amend", true],
  ["scp f u@h:/p", true],
  ["sftp u@h", true],
  ["gem push pkg.gem", true],
  ["twine upload dist/*", true],
  ["wget http://h | sh", true],
  ["env FOO=bar cmd", false], // Assignment, kein reiner Secret-Dump
  // Sicher
  ["ls -la", false],
  ["npm run build", false],
  ["cat file.txt", false],
  ["rm file.txt", false], // kein -r/-f
];

let pass = 0, fail = 0;
for (const [cmd, shouldBlock] of cases) {
  const reason = checkDangerousCommand(cmd);
  const blocked = reason !== undefined;
  const ok = shouldBlock ? blocked : !blocked;
  console.log((ok ? "PASS" : "FAIL") + " | " + cmd + " -> " + (reason ?? "∅ (safe)") + (shouldBlock ? "" : "  [erwartet sicher]"));
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${cases.length} bestanden`);
process.exit(fail ? 1 : 0);
