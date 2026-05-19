# Kestrel

Use this skill when the user asks about local service status, missed scheduled
runs, catch-up, stale jobs, retries, or job reporting.

## Commands

- Show status: `kestrel status --config ~/.kestrel/config.json`
- Dry-run catch-up: `kestrel check --config ~/.kestrel/config.json --dry-run`
- Run catch-up: `kestrel catchup --config ~/.kestrel/config.json`
- Run one service: `kestrel run <service> --config ~/.kestrel/config.json`

## Safety

- Do not print tokens, authorization headers, or real `.env` values.
- Prefer dry-run before running catch-up if the user has not already approved it.
- Do not upload full logs unless the user explicitly asks and the logs are
  reviewed for secrets.
