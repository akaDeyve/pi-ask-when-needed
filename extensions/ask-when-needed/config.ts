/**
 * Configuration schema and loader for ask-when-needed.
 * Config lives at ~/.pi/agent/extensions/ask-when-needed.json (global)
 * and .pi/extensions/ask-when-needed.json (project).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface Config {
  enabled: boolean;
  features: {
    shell: boolean;
    secrets: boolean;
    git: boolean;
    publish: boolean;
    network: boolean;
    pathPolicies: boolean;
  };
  dangerousCommands: { pattern: string; regex?: boolean; description: string }[];
  allowedPatterns: { pattern: string; regex?: boolean }[];
  policies: {
    id: string;
    patterns: string[];
    allowedPatterns?: string[];
    protection: "noAccess" | "readOnly";
    enabled?: boolean;
  }[];
  pathAccess: {
    mode: "allow" | "ask" | "block";
    dangerousPaths: string[];
  };
  nonInteractive: "block" | "allow";
}

export const DEFAULT_CONFIG: Config = {
  enabled: true,
  features: { shell: true, secrets: true, git: true, publish: true, network: true, pathPolicies: true },
  dangerousCommands: [],
  allowedPatterns: [],
  policies: [],
  pathAccess: { mode: "ask", dangerousPaths: [] },
  nonInteractive: "block",
};

function merge(base: Config, override: Partial<Config>): Config {
  return {
    ...base,
    ...override,
    features: { ...base.features, ...override.features },
    pathAccess: { ...base.pathAccess, ...override.pathAccess },
    dangerousCommands: [...base.dangerousCommands, ...(override.dangerousCommands ?? [])],
    allowedPatterns: [...base.allowedPatterns, ...(override.allowedPatterns ?? [])],
    policies: [...base.policies, ...(override.policies ?? [])],
  };
}

function loadFile(p: string): Partial<Config> | null {
  try {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {}
  return null;
}

export function loadConfig(cwd: string): Config {
  const home = os.homedir() || process.env.HOME || process.env.USERPROFILE || cwd;
  const global = loadFile(path.join(home, ".pi", "agent", "extensions", "ask-when-needed.json"));
  const project = loadFile(path.join(cwd, ".pi", "extensions", "ask-when-needed.json"));
  let config = DEFAULT_CONFIG;
  if (global) config = merge(config, global);
  if (project) config = merge(config, project);
  return config;
}
