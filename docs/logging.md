# Logging

## Principles

- Logging is configured only in composition roots.
- Log output is stderr-only.
- No application file sink is used.
- Supported formats: `text` and `json`.

## Runtime Controls

- `JOURNAL_LOG_LEVEL` (default: `INFO`)
- `JOURNAL_LOG_FORMAT` (default: `text`)
- `JOURNAL_LOG_CAP_BYTES` (default: `262144`)

CLI overrides are available on sync entrypoints and `sync.study`:

- `--log-level {DEBUG,INFO,WARNING,ERROR,CRITICAL}`
- `--log-format {text,json}`

## Log Growth Control

- `sync.sh` caps launchd files:
  - `/tmp/com.edo.journal.out`
  - `/tmp/com.edo.journal.err`
- `sync.study` caps `/tmp/com.edo.skip.log` on startup.
- Cap size is controlled by `JOURNAL_LOG_CAP_BYTES`.

## Logger Names

Use module logger names via `get_logger(__name__)`.
Names are mapped to the `journal.*` namespace (for example, `journal.sync.study.db`).
