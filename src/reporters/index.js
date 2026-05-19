"use strict";

const { createLocalReporter } = require("./local");
const { createDiscordReporter } = require("./discord");

function makeReporters(config, selected) {
  const names = selected || Object.keys(config.reporters || {}).filter((name) => config.reporters[name]?.enabled);
  const reporters = [];
  if (names.includes("local")) reporters.push(createLocalReporter());
  if (names.includes("discord")) {
    const reporter = createDiscordReporter(config.reporters.discord || {}, process.env);
    if (reporter) reporters.push(reporter);
  }
  return reporters.length ? reporters : [createLocalReporter()];
}

async function notify(reporters, method, payload) {
  for (const reporter of reporters) {
    if (typeof reporter[method] !== "function") continue;
    try {
      await reporter[method](payload);
    } catch (err) {
      console.error(`kestrel reporter ${reporter.name} error: ${err.message}`);
    }
  }
}

module.exports = { makeReporters, notify };
