"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { expandHome } = require("./config");
const { localDateKey } = require("./time");

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  mkdirp(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function append(file, text) {
  mkdirp(path.dirname(file));
  fs.appendFileSync(file, text);
}

function runId() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function runsRoot(config) {
  return expandHome(config.defaults.runs_dir || "~/.kestrel/runs");
}

function serviceRunDirs(config, serviceName) {
  const dir = path.join(runsRoot(config), serviceName);
  try {
    return fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((item) => fs.statSync(item).isDirectory());
  } catch {
    return [];
  }
}

function readRuns(config, serviceName) {
  return serviceRunDirs(config, serviceName)
    .map((dir) => readJson(path.join(dir, "metadata.json")))
    .filter(Boolean)
    .sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
}

function runsForDate(config, serviceName, dateKey, timeZone) {
  return readRuns(config, serviceName).filter((run) => {
    if (!run.started_at) return false;
    return localDateKey(new Date(run.started_at), timeZone) === dateKey;
  });
}

function hasSuccessForDate(config, serviceName, dateKey, timeZone) {
  return runsForDate(config, serviceName, dateKey, timeZone).some((run) => run.status === "success");
}

function catchupAttemptsForDate(config, serviceName, dateKey, timeZone) {
  return runsForDate(config, serviceName, dateKey, timeZone).filter((run) => run.trigger === "catchup").length;
}

function staleRuns(config, serviceName, staleAfterMinutes) {
  const cutoff = Date.now() - staleAfterMinutes * 60 * 1000;
  return readRuns(config, serviceName).filter((run) => {
    if (run.status !== "running" || !run.started_at) return false;
    return new Date(run.started_at).getTime() < cutoff;
  });
}

module.exports = {
  append,
  catchupAttemptsForDate,
  hasSuccessForDate,
  mkdirp,
  nowIso,
  readJson,
  readRuns,
  runId,
  runsForDate,
  runsRoot,
  staleRuns,
  writeJson,
};
