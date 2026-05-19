#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2] || ".";
const allow = new Set([".git", "node_modules", "runs", "logs", "tmp"]);
const patterns = [
  { name: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "OpenAI-style token", re: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", re: /\bgh[opsu]_[A-Za-z0-9_]{20,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "Discord token", re: /\b[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/ },
  { name: "authorization header", re: /\bAuthorization:\s*Bearer\s+[A-Za-z0-9._-]{10,}/i },
];

function files(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (allow.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(full));
    else out.push(full);
  }
  return out;
}

let failed = false;
for (const file of files(root)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.re.test(text)) {
      console.error(`possible secret (${pattern.name}): ${rel}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("secret scan passed");
