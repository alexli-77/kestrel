"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function expandHome(value) {
  if (typeof value !== "string") return value;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function defaultConfig() {
  return {
    defaults: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC",
      runs_dir: "~/.kestrel/runs",
      state_file: "~/.kestrel/state.json",
      lock_file: "~/.kestrel/kestrel.lock",
      stale_after_minutes: 60,
      timeout_minutes: 30,
      max_message_chars: 1800,
      stdout_tail_lines: 50,
      stderr_tail_lines: 80,
      privacy: {
        redact_tokens: true,
        redact_home: true,
        redact_emails: true,
        redact_urls: true,
        redact_long_ids: true,
      },
    },
    reporters: {
      local: { enabled: true },
    },
    services: {},
    templates: {},
  };
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = deepMerge(base?.[key] ?? {}, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadConfig(configPath) {
  const base = defaultConfig();
  const selected = configPath || process.env.KESTREL_CONFIG || null;
  if (!selected) return base;
  const loaded = readJson(expandHome(selected));
  return deepMerge(base, loaded);
}

function resolveService(config, name, cli = {}) {
  const service = config.services?.[name] || {};
  return {
    name,
    enabled: service.enabled !== false,
    schedule: service.schedule || null,
    cwd: cli.cwd || service.cwd || process.cwd(),
    command: cli.command?.length ? cli.command : service.command || [],
    reporters: cli.noRemote ? ["local"] : service.reporters,
    max_catchup_per_day: Number(service.max_catchup_per_day ?? 1),
    stale_after_minutes: Number(service.stale_after_minutes ?? config.defaults.stale_after_minutes ?? 60),
    timeout_minutes: Number(service.timeout_minutes ?? config.defaults.timeout_minutes ?? 30),
  };
}

module.exports = { expandHome, loadConfig, resolveService };
