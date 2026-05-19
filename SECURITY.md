# Security

Kestrel is intended to run local automation, so treat configuration and logs as
sensitive.

## Never Commit

- API tokens or bot tokens
- Authorization headers
- Real `.env` files
- Real `config.json`
- Any `config.*.json` other than `config.example.json`
- Private hostnames, tunnel URLs, or personal IPs
- Personal channel IDs
- Run logs or artifacts
- Vault contents or private note paths

## Redaction

Kestrel redacts common tokens, authorization headers, private keys, email
addresses, long numeric ids, URL credentials, and the local home path before
sending messages to remote reporters.

Redaction is a defense layer, not permission to send private logs. Remote
reporters should receive short summaries only.

## Reporting a Vulnerability

Open a private advisory or contact the repository owner. Do not include live
secrets in an issue.
