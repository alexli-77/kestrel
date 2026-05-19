#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { expandHome, loadConfig, resolveService } = require("./config");
const { redact } = require("./redaction");
const { getTemplate, render } = require("./templates");
const { makeReporters, notify } = require("./reporters");
const {
  append,
  catchupAttemptsForDate,
  hasSuccessForDate,
  mkdirp,
  nowIso,
  readRuns,
  runId,
  runsRoot,
  staleRuns,
  writeJson,
} = require("./runs");
const { isDueToday, localDateKey } = require("./time");

function usage() {
  console.error(`usage:
  kestrel run <service> [--config <path>] [--cwd <path>] [--no-remote] [--trigger <manual|catchup|scheduled>] -- <command> [args...]
  kestrel check [--config <path>] [--dry-run] [--date YYYY-MM-DD]
  kestrel catchup [--config <path>] [--dry-run]
  kestrel status [--config <path>]
  kestrel services [--config <path>]`);
  process.exit(2);
}

function parseGlobal(argv) {
  let configPath = process.env.KESTREL_CONFIG || null;
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config") {
      configPath = argv[i + 1];
      if (!configPath) usage();
      i += 1;
    } else {
      out.push(argv[i]);
    }
  }
  return { argv: out, configPath };
}

function parseRun(argv, configPath) {
  const service = argv[1];
  if (!service) usage();
  let cwd = null;
  let noRemote = false;
  let trigger = "manual";
  let idx = 2;
  while (idx < argv.length) {
    const arg = argv[idx];
    if (arg === "--") {
      idx += 1;
      break;
    }
    if (arg === "--cwd") {
      cwd = argv[idx + 1];
      if (!cwd) usage();
      idx += 2;
      continue;
    }
    if (arg === "--no-remote") {
      noRemote = true;
      idx += 1;
      continue;
    }
    if (arg === "--trigger") {
      trigger = argv[idx + 1];
      if (!trigger) usage();
      idx += 2;
      continue;
    }
    usage();
  }
  return { commandName: "run", service, configPath, cwd, noRemote, trigger, command: argv.slice(idx) };
}

function parseFlag(argv, name) {
  return argv.includes(name);
}

function parseOption(argv, name) {
  const idx = argv.indexOf(name);
  return idx === -1 ? null : argv[idx + 1] || null;
}

function tail(text, n) {
  return text.trimEnd().split(/\r?\n/).filter(Boolean).slice(-n).join("\n");
}

function duration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || "";
  return `${text.slice(0, max - 40)}\n... [truncated ${text.length - max + 40} chars]`;
}

function commandText(command) {
  return command.map((item) => (/\s/.test(item) ? JSON.stringify(item) : item)).join(" ");
}

function message(config, name, vars) {
  const privacy = config.defaults.privacy || {};
  const max = config.defaults.max_message_chars || 1800;
  return truncate(redact(render(getTemplate(config, name), vars), privacy), max);
}

async function runService(cli) {
  const config = loadConfig(cli.configPath);
  const service = resolveService(config, cli.service, cli);
  if (!service.command.length) usage();

  const id = runId();
  const runDir = path.join(runsRoot(config), service.name, id);
  mkdirp(runDir);

  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  const eventsPath = path.join(runDir, "events.jsonl");
  const startedAt = Date.now();
  const startedIso = nowIso();
  const baseVars = {
    service: service.name,
    run_id: id,
    cwd: service.cwd,
    command: commandText(service.command),
    run_dir: runDir,
  };
  const metadata = {
    ...baseVars,
    command: service.command,
    trigger: cli.trigger || "manual",
    started_at: startedIso,
    status: "running",
  };
  writeJson(path.join(runDir, "metadata.json"), metadata);
  append(eventsPath, `${JSON.stringify({ ts: startedIso, event: "started", service: service.name, run_id: id })}\n`);

  const reporters = makeReporters(config, service.reporters);
  await notify(reporters, "started", {
    content: message(config, "started", baseVars),
    threadName: redact(`${service.name} / ${startedIso.slice(0, 10)} / ${id.slice(-6)}`, config.defaults.privacy || {}),
  });

  let stdout = "";
  let stderr = "";
  const child = spawn(service.command[0], service.command.slice(1), {
    cwd: expandHome(service.cwd),
    env: {
      ...process.env,
      KESTREL_RUN_ID: id,
      KESTREL_SERVICE: service.name,
      KESTREL_TRIGGER: cli.trigger || "manual",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => {
    const text = data.toString();
    stdout += text;
    append(stdoutPath, text);
  });
  child.stderr.on("data", (data) => {
    const text = data.toString();
    stderr += text;
    append(stderrPath, text);
  });

  let timedOut = false;
  const timeoutMs = Math.max(1, service.timeout_minutes || 30) * 60 * 1000;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
    }, 5000).unref();
  }, timeoutMs);
  timeout.unref();

  const outcome = await new Promise((resolve) => {
    child.on("error", (err) => resolve({ code: 127, signal: null, error: err.message }));
    child.on("close", (code, signal) => resolve({ code, signal, error: null }));
  });
  clearTimeout(timeout);

  const durationMs = Date.now() - startedAt;
  const status = outcome.code === 0 ? "success" : "failed";
  const finishedVars = {
    ...baseVars,
    status,
    exit_code: outcome.code,
    signal: outcome.signal || "",
    error: timedOut ? `Timed out after ${service.timeout_minutes} minutes` : outcome.error || "",
    duration: duration(durationMs),
    stdout_tail: tail(stdout, config.defaults.stdout_tail_lines || 50),
    stderr_tail: tail(stderr, config.defaults.stderr_tail_lines || 80),
  };
  const finished = {
    ...metadata,
    status,
    exit_code: outcome.code,
    signal: outcome.signal,
    error: timedOut ? `Timed out after ${service.timeout_minutes} minutes` : outcome.error,
    duration_ms: durationMs,
    finished_at: nowIso(),
    stdout_path: stdoutPath,
    stderr_path: stderrPath,
  };
  writeJson(path.join(runDir, "metadata.json"), finished);
  append(eventsPath, `${JSON.stringify({ ts: nowIso(), event: status, exit_code: outcome.code, duration_ms: durationMs })}\n`);
  await notify(reporters, "finished", { content: message(config, status, finishedVars) });
  return outcome.code || 0;
}

function serviceEntries(config) {
  return Object.entries(config.services || {}).map(([name]) => resolveService(config, name));
}

function plannedActions(config, dateKey = null) {
  const now = new Date();
  const timeZone = config.defaults.timezone;
  const selectedDate = dateKey || localDateKey(now, timeZone);
  const actions = [];
  for (const service of serviceEntries(config)) {
    if (!service.enabled || !service.schedule) continue;
    const due = isDueToday(service.schedule, now, timeZone, selectedDate);
    const hasSuccess = hasSuccessForDate(config, service.name, selectedDate, timeZone);
    const attempts = catchupAttemptsForDate(config, service.name, selectedDate, timeZone);
    const maxAttempts = service.max_catchup_per_day;
    const stale = staleRuns(config, service.name, service.stale_after_minutes);
    if (due && !hasSuccess && attempts < maxAttempts) {
      actions.push({
        type: "catchup",
        service,
        date: selectedDate,
        reason: `no successful run found for ${selectedDate}`,
        due: service.schedule.time,
      });
    }
    for (const run of stale) {
      actions.push({ type: "stale", service, run });
    }
  }
  return actions;
}

function withLock(config, fn) {
  const lockFile = expandHome(config.defaults.lock_file || "~/.kestrel/kestrel.lock");
  mkdirp(path.dirname(lockFile));
  let fd;
  try {
    fd = fs.openSync(lockFile, "wx");
  } catch {
    console.error(`kestrel lock is held: ${lockFile}`);
    return 75;
  }
  try {
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    return fn();
  } finally {
    fs.closeSync(fd);
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Best effort cleanup; a later run will report the held lock.
    }
  }
}

async function checkOrCatchup(argv, configPath, execute) {
  const dryRun = parseFlag(argv, "--dry-run") || !execute;
  const dateKey = parseOption(argv, "--date");
  const config = loadConfig(configPath);
  const actions = plannedActions(config, dateKey);
  const printable = actions.map((action) => {
    if (action.type === "catchup") {
      return {
        type: action.type,
        service: action.service.name,
        date: action.date,
        due: action.due,
        reason: action.reason,
        command: action.service.command,
      };
    }
    return {
      type: action.type,
      service: action.service.name,
      run_id: action.run.run_id,
      started_at: action.run.started_at,
    };
  });
  console.log(JSON.stringify({ dry_run: dryRun, actions: printable }, null, 2));
  if (dryRun) return 0;

  return withLock(config, async () => {
    let exitCode = 0;
    for (const action of actions) {
      if (action.type !== "catchup") continue;
      const code = await runService({
        commandName: "run",
        service: action.service.name,
        configPath,
        cwd: null,
        noRemote: false,
        trigger: "catchup",
        command: [],
      });
      if (code !== 0 && exitCode === 0) exitCode = code;
    }
    return exitCode;
  });
}

function status(configPath) {
  const config = loadConfig(configPath);
  const timeZone = config.defaults.timezone;
  const dateKey = localDateKey(new Date(), timeZone);
  const rows = serviceEntries(config).map((service) => {
    const runs = readRuns(config, service.name);
    const latest = runs[0] || null;
    return {
      service: service.name,
      enabled: service.enabled,
      schedule: service.schedule,
      today_success: hasSuccessForDate(config, service.name, dateKey, timeZone),
      latest_status: latest?.status || null,
      latest_run_id: latest?.run_id || null,
      latest_started_at: latest?.started_at || null,
    };
  });
  console.log(JSON.stringify({ date: dateKey, services: rows }, null, 2));
  return 0;
}

function services(configPath) {
  const config = loadConfig(configPath);
  console.log(JSON.stringify({ services: serviceEntries(config) }, null, 2));
  return 0;
}

async function main() {
  const { argv, configPath } = parseGlobal(process.argv.slice(2));
  const command = argv[0];
  if (!command) usage();
  if (command === "run") process.exit(await runService(parseRun(argv, configPath)));
  if (command === "check") process.exit(await checkOrCatchup(argv, configPath, false));
  if (command === "catchup") process.exit(await checkOrCatchup(argv, configPath, true));
  if (command === "status") process.exit(status(configPath));
  if (command === "services") process.exit(services(configPath));
  usage();
}

main().catch((err) => {
  console.error(`kestrel error: ${err.stack || err.message}`);
  process.exit(1);
});
