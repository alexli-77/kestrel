# Kestrel Keeper

<p align="center">
  <img src="docs/assets/kestrel-logo-banner.png" alt="Kestrel" width="700">
</p>

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
      "timeout_minutes": 30,
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

### Example Hermes Skill

Install a Hermes skill that maps natural-language service commands to Kestrel:

```text
~/.hermes/skills/devops/kestrel/SKILL.md
```

Example skill content:

```markdown
# Kestrel

Use this skill when the user asks about local service status, missed scheduled
runs, catch-up, stale jobs, retries, job logs, or Discord job alerts.

## Commands

- Show status: `kestrel status --config ~/.kestrel/config.json`
- Dry-run catch-up: `kestrel check --config ~/.kestrel/config.json --dry-run`
- Run catch-up: `kestrel catchup --config ~/.kestrel/config.json`
- Show services: `kestrel services --config ~/.kestrel/config.json`
- Run one service manually: `kestrel run <service> --config ~/.kestrel/config.json`
```

When Hermes receives a Discord or chat message, it can route short phrases to
Kestrel:

| User phrase | Kestrel command |
| --- | --- |
| `巡检服务` | `kestrel status --config ~/.kestrel/config.json` |
| `检查漏跑` | `kestrel check --config ~/.kestrel/config.json --dry-run` |
| `补跑漏掉的服务` | `kestrel catchup --config ~/.kestrel/config.json` |
| `列出服务` | `kestrel services --config ~/.kestrel/config.json` |
| `补跑 <service>` | `kestrel run <service> --config ~/.kestrel/config.json` |

Recommended Hermes response style:

- Start with a one-line summary.
- List each service as `service: status`.
- Highlight failed or missing services first.
- Do not include raw config, tokens, channel ids, private paths, or full logs.

## Discord Alerts

Kestrel can send job notifications to Discord through environment variables.
The committed config should only contain variable names, never real tokens or
channel IDs:

```json
{
  "reporters": {
    "discord": {
      "enabled": true,
      "token_env": "DISCORD_BOT_TOKEN",
      "channel_env": "KESTREL_DISCORD_CHANNEL_ID",
      "create_threads": true
    }
  }
}
```

Runtime environment:

```bash
export DISCORD_BOT_TOKEN="replace-with-real-token-outside-git"
export KESTREL_DISCORD_CHANNEL_ID="replace-with-real-channel-id-outside-git"
```

Suggested readable templates:

```json
{
  "templates": {
    "started": "Kestrel started a job\n\nService: {service}\nRun: {run_id}\nStatus: running",
    "success": "Kestrel job succeeded\n\nService: {service}\nRun: {run_id}\nDuration: {duration}\nResult: completed successfully",
    "failed": "Kestrel job failed\n\nService: {service}\nRun: {run_id}\nDuration: {duration}\nExit code: {exit_code}\nResult: needs attention\n\nRecent error:\n{stderr_tail}"
  }
}
```

Example Discord output:

```text
Kestrel job succeeded

Service: follow-builders.reply-x
Run: 20260101-120000-example
Duration: 57.4s
Result: completed successfully
```

## Design Notes

Kestrel borrows the host-side reliability pattern from systems like NanoClaw:
periodic sweep, run metadata, stale detection, bounded retries, and deterministic
service state. It deliberately avoids becoming a full agent platform.
