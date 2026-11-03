# Changelog

## 1.0.0

- Initial release.
- Interactive confirmation for dangerous bash commands (deletes, system/privileges, git history/remotes, network/publishing, secrets).
- Write/edit protection: blocks writes outside the project, to secret files (`.env`, `*.pem`, `*.key`), and to protected dirs (`.git/`, `.pi/`).
- Preview of the exact command / unified-diff-style change before each prompt.
- `/ask-when-needed [on|off]` command and `PI_ASK_WHEN_NEEDED` env var to control startup state.
