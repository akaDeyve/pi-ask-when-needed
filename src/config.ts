/**
 * Configuration: schema, defaults and loading. Every rule that is data lives in DEFAULT_CONFIG,
 * so a config file can extend or swap it without touching code.
 *
 *   Global   ~/.pi/agent/extensions/ask-when-needed.json
 *   Project  .pi/extensions/ask-when-needed.json   (trusted projects only, overrides global)
 */
import * as fs from "node:fs";

/** A substring of the command, or a regular expression with `regex: true`. */
export interface CommandPattern {
  pattern: string;
  regex?: boolean;
  description?: string;
}

/**
 * Protects paths that match `patterns` (globs, see paths.ts) unless they match `allowedPatterns`.
 * `noAccess` guards reading and writing, `readOnly` guards writing only.
 */
export interface Policy {
  id: string;
  patterns: string[];
  allowedPatterns?: string[];
  protection: "noAccess" | "readOnly";
  description?: string;
  enabled?: boolean;
}

export interface Config {
  enabled: boolean;
  /** Who decides about a dangerous action: a mode from index.ts (`ask`, `classifier`). */
  mode: string;
  /** Classifier mode (see decider-classifier.ts). `block` and `allow` add to the built-in rules. */
  classifier: {
    /** `provider/id` of a chat model. Default: the session's model. */
    model?: string;
    /** What counts as trusted; everything else is external. */
    environment: string;
    /** What is blocked unless an exception applies or the user asked for exactly that. */
    block: string[];
    /** The exceptions. */
    allow: string[];
  };
  /** Detection categories (matcher modules) and `pathPolicies`; everything is on unless set to false. */
  features: Record<string, boolean>;
  dangerousCommands: CommandPattern[];
  allowedPatterns: CommandPattern[];
  policies: Policy[];
  /** Writes outside the project to `dangerousPaths` (globs): allow, ask or block them. */
  pathAccess: { mode: "allow" | "ask" | "block"; dangerousPaths: string[] };
  /** What happens to a dangerous action when nobody can be asked. */
  nonInteractive: "block" | "allow";
}

export const DEFAULT_CONFIG: Config = {
  enabled: true,
  mode: "ask",
  classifier: {
    environment:
      "Trusted: the project directory and its git repository. Everything else – other directories, hosts, registries, cloud accounts and services – is external.",
    block: [
      "destroy or exfiltrate: delete or overwrite files, history or data that cannot be brought back (force-push, hard reset, recursive delete), or send secrets or internal data to an external place",
      "weaken security: gain root, loosen permissions, switch off checks or logs, install something that persists (cron job, service, SSH key), or change the agent's own permissions",
      "cross a trust boundary: read stored credentials or secret files, run code from outside the project, or pass data to a service the user never named",
      "bypass review or affect others: push to a shared or default branch, publish, release or deploy, or touch processes, services and resources the agent did not start",
    ],
    allow: [
      "deleting build output, caches and temporary files that can be rebuilt (dist, build, node_modules, *.tmp)",
      "pushing the branch this session works on, unless it is the default branch",
      "standard credential flows: a tool reading its own stored login, or the project's env file being loaded to run the project",
      "stopping or restarting a process the agent started itself in this session",
    ],
  },
  features: { shell: true, secrets: true, git: true, publish: true, powershell: true, pathPolicies: true },
  dangerousCommands: [],
  allowedPatterns: [],
  policies: [
    {
      id: "secret-files",
      description: "may contain secrets",
      protection: "noAccess",
      patterns: [
        ".env", ".env.*", ".dev.vars", ".netrc", "*credentials*",
        ".ssh", ".aws", ".gnupg", ".kube", ".docker", ".config/gh", ".config/gcloud", ".config/op", ".config/sops",
        "*.pem", "*.key", "*.p12", "*.gpg", "id_rsa", "id_ed25519", "id_ecdsa",
        "*.db", "*.sqlite", "*.sqlite3", "*.mdb",
      ],
      allowedPatterns: [".env.example", ".env.sample", ".env.template"],
    },
    {
      id: "protected-dirs",
      description: "can run code (Git hooks, Pi extensions)",
      protection: "readOnly",
      patterns: [".git", ".pi"],
    },
  ],
  pathAccess: {
    mode: "ask",
    dangerousPaths: [
      "/etc", "/bin", "/sbin", "/boot", "/root", "/sys", "/proc", "/dev", "/lib", "/lib64", "/usr", "/var",
      "~/.config", "~/.npm",
      "*:/windows", "*:/winnt", "system32", "syswow64",
    ],
  },
  nonInteractive: "block",
};

/** Lists add up, everything else is overridden. A policy with a known `id` extends that policy the same way. */
function merge(base: Config, override: Partial<Config>): Config {
  const policies = new Map(base.policies.map((policy) => [policy.id, policy]));
  for (const policy of override.policies ?? []) {
    const known = policies.get(policy.id);
    policies.set(policy.id, {
      ...known,
      ...policy,
      patterns: [...(known?.patterns ?? []), ...(policy.patterns ?? [])],
      allowedPatterns: [...(known?.allowedPatterns ?? []), ...(policy.allowedPatterns ?? [])],
    });
  }
  return {
    ...base,
    ...override,
    classifier: {
      ...base.classifier,
      ...override.classifier,
      block: [...base.classifier.block, ...(override.classifier?.block ?? [])],
      allow: [...base.classifier.allow, ...(override.classifier?.allow ?? [])],
    },
    features: { ...base.features, ...override.features },
    dangerousCommands: [...base.dangerousCommands, ...(override.dangerousCommands ?? [])],
    allowedPatterns: [...base.allowedPatterns, ...(override.allowedPatterns ?? [])],
    policies: [...policies.values()],
    pathAccess: {
      ...base.pathAccess,
      ...override.pathAccess,
      dangerousPaths: [...base.pathAccess.dangerousPaths, ...(override.pathAccess?.dangerousPaths ?? [])],
    },
  };
}

/** Merges the config files over the defaults, later files winning. Missing files are skipped, broken ones throw. */
export function loadConfig(files: string[]): Config {
  return files.filter((file) => fs.existsSync(file)).reduce((config, file) => {
    try {
      return merge(config, JSON.parse(fs.readFileSync(file, "utf8")));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }, DEFAULT_CONFIG);
}
