# Architecture

Kestrel has one bounded responsibility: make local scheduled services observable
and recoverable.

```text
launchd / cron / manual CLI / Hermes
        |
        v
Kestrel CLI
        |
        +-- service registry
        +-- run wrapper
        +-- catch-up checker
        +-- stale detector
        +-- reporter adapters
        |
        v
local runs + optional remote alerts
```

## Components

- `src/cli.js`: command entry point.
- `src/config.js`: JSON config loading and service resolution.
- `src/runs.js`: run metadata, history, and success detection.
- `src/time.js`: timezone-aware daily date and due checks.
- `src/reporters/*`: local and Discord reporters.
- `src/redaction.js`: privacy scrubber used before remote sends.

## Why Standalone

Reliability should not depend on an LLM gateway. Kestrel can be invoked by
Hermes, but it also works when Hermes is stopped. This separates interaction
from execution reliability:

- Hermes: understand requests, choose tools, summarize logs.
- Kestrel: wrap, detect, catch up, retry, and report.

## First-Version Constraints

- Daily schedules only.
- No artifact upload.
- No secret storage.
- No long-running daemon process.
- Catch-up is bounded by `max_catchup_per_day`.
