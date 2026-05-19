"use strict";

const defaults = {
  started: "[started] {service}\nrun: {run_id}\ncwd: {cwd}",
  success: "[success] {service} finished in {duration}\nrun: {run_id}",
  failed: "[failed] {service} finished in {duration}\nexit: {exit_code}\nrun: {run_id}\n\nstderr:\n{stderr_tail}",
  catchup: "[catch-up] {service}\nreason: {reason}\ndue: {due}",
  stale: "[stale] {service}\nrun: {run_id}\nage: {age_minutes} min",
};

function getTemplate(config, name) {
  return config.templates?.[name] || defaults[name] || "{service} {status}";
}

function render(template, values) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key) => String(values[key] ?? ""));
}

module.exports = { getTemplate, render };
