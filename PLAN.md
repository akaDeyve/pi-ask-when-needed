# Plan: Configurable Settings File for ask-when-needed

## Goal

Replace hardcoded detection rules with a user-configurable JSON settings file, following pi-guardrails' config conventions (but simpler — no settings UI, no delegation).

## Current State (Hardcoded)

| Category | Hardcoded in | What |
|---|---|---|
| Shell matchers | `matchers-shell.ts` | 18 matchers (rm, sudo, dd, mkfs, container, etc.) |
| Secret matchers | `matchers-secrets.ts` | 2 matchers (printenv, obfuscation) |
| Git matchers | `matchers-git.ts` | 1 matcher (git) |
| Publish matchers | `matchers-publish.ts` | 1 matcher (publish) |
| Network matchers | `matchers-network.ts` | 1 matcher (net) |
| Path policies | `paths.ts` | SECRET_FILE, PROTECTED_DIR, DANGEROUS_OUTSIDE |
| Read/write tools | `paths.ts` | `READ_TOOLS`, `WRITE_TOOLS` |
| Outside-path | `paths.ts` | `isDangerousOutside()` (hardcoded dangerous paths) |

## Proposed Config File

**Location:**
- Global: `~/.pi/agent/extensions/ask-when-needed.json`
- Project: `.pi/extensions/ask-when-needed.json` (after trust)

**Schema (TypeScript):**

```typescript
interface AskWhenNeededConfig {
  version: string;
  enabled: boolean;

  // Toggle entire detection categories on/off
  features: {
    shell: boolean;      // rm, sudo, dd, container, etc.
    secrets: boolean;    // printenv, eval, base64
    git: boolean;        // git push, reset --hard, etc.
    publish: boolean;    // npm publish, gh release, etc.
    network: boolean;    // ssh, curl -d, pipe-to-shell
    pathPolicies: boolean; // secret files, protected dirs, dangerous outside
  };

  // Custom dangerous command patterns (user-added)
  dangerousCommands: Array<{
    pattern: string;      // substring or regex
    regex?: boolean;
    description: string;
  }>;

  // Custom allowed patterns (override built-in detection)
  allowedPatterns: Array<{
    pattern: string;
    regex?: boolean;
  }>;

  // Path policies (like pi-guardrails)
  policies: Array<{
    id: string;
    patterns: string[];       // file patterns to protect
    allowedPatterns?: string[]; // exceptions
    protection: "noAccess" | "readOnly";
    enabled?: boolean;
  }>;

  // Outside-project detection
  pathAccess: {
    mode: "allow" | "ask" | "block";  // default: "ask"
    // Dangerous system paths (user can extend)
    dangerousPaths: string[];
  };

  // Non-interactive behavior
  nonInteractive: "block" | "allow"; // default: "block"
}
```

**Example file:**

```json
{
  "version": "1.0.0",
  "enabled": true,
  "features": {
    "shell": true,
    "secrets": true,
    "git": true,
    "publish": true,
    "network": true,
    "pathPolicies": true
  },
  "dangerousCommands": [
    { "pattern": "terraform destroy", "description": "destroys infrastructure" }
  ],
  "allowedPatterns": [
    { "pattern": "git push --force-with-lease", "description": "safe force-push" }
  ],
  "policies": [
    {
      "id": "secret-files",
      "patterns": [".env", "*.pem", "*.key"],
      "allowedPatterns": [".env.example"],
      "protection": "noAccess",
      "enabled": true
    }
  ],
  "pathAccess": {
    "mode": "ask",
    "dangerousPaths": ["/etc", "/usr", "C:\\Windows"]
  },
  "nonInteractive": "block"
}
```

## Implementation Plan

### Phase 1: Config Schema + Loader
1. Create `config.ts` with TypeScript types and JSON schema
2. Create `config-loader.ts` that reads from global + project paths
3. Merge global + project configs (project overrides global)
4. Validate against schema on load

### Phase 2: Wire Config into Detection
1. `detector.ts`: load config on startup, use it to filter matchers
2. `matchers-*.ts`: check `features.{category}` before returning matchers
3. `paths.ts`: load `policies`, `pathAccess.dangerousPaths` from config
4. Add `dangerousCommands` and `allowedPatterns` as additional matchers

### Phase 3: Settings Command
1. Add `/ask-when-needed:settings` command to open/edit config
2. Add `/ask-when-needed:reload` to reload config without restart
3. Show current config status in footer

### Phase 4: Documentation + Tests
1. Update README with config file documentation
2. Add example config file
3. Add tests for config loading/merging
4. Bump version to 1.4.0

## Key Design Decisions

1. **JSON not YAML** — simpler, no extra dependency, matches pi-guardrails
2. **No settings UI** — file-based only (like current approach), users edit JSON directly
3. **Backward compatible** — if no config file exists, use built-in defaults (current behavior)
4. **Feature toggles** — coarse-grained (per category), not per-matcher (too granular)
5. **Custom patterns** — users can add their own dangerous commands without editing code

## Open Questions

- Should I add a `pi.askWhenNeeded` config field in `settings.json` instead of a separate file? (pi-guardrails uses separate file)
- Should project config require trust? (pi-guardrails: yes)
- Should I support config hot-reload on file change? (pi-guardrails: yes via `/guardrails:reload`)

## Next Steps

1. Implement Phase 1 (config schema + loader)
2. Wire into detection (Phase 2)
3. Add reload command (Phase 3)
4. Document + test (Phase 4)
5. Release as v1.4.0
