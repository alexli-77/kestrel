# Kestrel Keeper

Kestrel is a small reliability companion for scheduled local services. It wraps
job runs, stores local artifacts, detects missed daily jobs, catches them up,
and reports status to configurable outputs.

It is designed to stay useful with or without an agent framework:

- Standalone: launchd, cron, systemd, manual CLI, or CI can call `kestrel`.
- Hermes-integrated: a Hermes skill can call the same CLI for status, catch-up,
  manual runs, and failure summaries.

## What It Does

- Wrap service commands with `kestrel run`.
- Capture `stdout`, `stderr`, `metadata.json`, and `events.jsonl`.
- Detect missed daily service runs with `kestrel check`.
- Catch up missed runs with `kestrel catchup`.
- Detect stale running jobs from local metadata.
- Report to local stderr and Discord.
- Redact secrets before remote reporting.

## Safety Rules

Kestrel must not upload private data by default.

- Do not commit `.env`, real `config.json`, logs, run output, private hostnames,
  home paths, channel ids, or API tokens.
- Reporter credentials must come from environment variables.
- Remote reporters receive redacted and truncated summaries.
- Full logs stay local unless an explicit artifact uploader is added.
- Run `npm run scan:secrets` before publishing.

## Quick Start

```bash
npm install
npm run test
```

Run a command manually:

```bash
node ./src/cli.js run demo.daily --config ./config.example.json --no-remote -- echo "hello from kestrel"
```

Check whether configured services need catch-up:

```bash
node ./src/cli.js check --config ./config.example.json --dry-run
```

Run catch-up:

```bash
node ./src/cli.js catchup --config ./config.json
```

## Commands

```bash
kestrel run <service> [--config <path>] [--cwd <path>] [--no-remote] -- <command> [args...]
kestrel check [--config <path>] [--dry-run] [--date YYYY-MM-DD]
kestrel catchup [--config <path>] [--dry-run]
kestrel status [--config <path>]
kestrel services [--config <path>]
```

## Configuration

Copy the example and keep the real file untracked:

```bash
cp config.example.json config.json
```

Example service:

```json
{
  "services": {
    "my-service.daily": {
      "enabled": true,
      "schedule": {
        "type": "daily",
        "time": "09:00",
        "catchup_after_minutes": 10
      },
      "cwd": "/path/to/service",
      "command": ["/bin/zsh", "scripts/run-daily.sh"],
      "max_catchup_per_day": 1,
      "reporters": ["local", "discord"]
    }
  }
}
```

## Data Model

Each run writes to:

```text
~/.kestrel/runs/<service>/<run-id>/
  metadata.json
  stdout.log
  stderr.log
  events.jsonl
```

`catchup` decides whether a service is missing by checking for a successful run
for the service on the configured local date.

## Hermes Integration

Kestrel should be registered in Hermes as a skill/tool wrapper, not embedded in
Hermes core. Hermes decides what the user is asking for, then calls Kestrel:

```text
Hermes command -> kestrel status
Hermes command -> kestrel catchup --dry-run
Hermes command -> kestrel run service.name
```

This keeps reliability independent from the agent gateway. If Hermes is down,
launchd can still run Kestrel.

## Design Notes

Kestrel borrows the host-side reliability pattern from systems like NanoClaw:
periodic sweep, run metadata, stale detection, bounded retries, and deterministic
service state. It deliberately avoids becoming a full agent platform.
