"use strict";

const os = require("node:os");

const SECRET_KEY_RE = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|API[_-]?KEY|AUTH|COOKIE|SESSION)[A-Z0-9_]*)\s*=\s*([^\s]+)/gi;
const AUTH_HEADER_RE = /\b(authorization|proxy-authorization|x-api-key|cookie|set-cookie)\s*[:=]\s*([^\r\n]+)/gi;
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const URL_CREDENTIAL_RE = /\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const LONG_ID_RE = /\b\d{15,22}\b/g;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value, options = {}) {
  const cfg = {
    redact_tokens: true,
    redact_home: true,
    redact_emails: true,
    redact_urls: true,
    redact_long_ids: true,
    ...options,
  };
  let text = String(value ?? "");

  if (cfg.redact_tokens) {
    text = text.replace(PRIVATE_KEY_RE, "[REDACTED_PRIVATE_KEY]");
    text = text.replace(SECRET_KEY_RE, "$1=[REDACTED]");
    text = text.replace(AUTH_HEADER_RE, "$1: [REDACTED]");
    text = text.replace(/\b(?:gh[opsu]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, "[REDACTED_TOKEN]");
    text = text.replace(/\b[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_TOKEN]");
  }

  if (cfg.redact_urls) {
    text = text.replace(URL_CREDENTIAL_RE, "$1[REDACTED]@");
  }

  if (cfg.redact_emails) {
    text = text.replace(EMAIL_RE, "[REDACTED_EMAIL]");
  }

  if (cfg.redact_home) {
    const home = os.homedir();
    if (home && home !== "/") {
      text = text.replace(new RegExp(escapeRegExp(home), "g"), "~");
    }
  }

  if (cfg.redact_long_ids) {
    text = text.replace(LONG_ID_RE, "[REDACTED_ID]");
  }

  return text;
}

module.exports = { redact };
