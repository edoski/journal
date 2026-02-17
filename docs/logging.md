# Logging

## Principles

- Logging is configured only in composition roots.
- Log output is stderr-only.
- No application file sink is used.
- Supported formats: `text` and `json`.

## Runtime Controls

- default level: `INFO`
- default format: `text`

CLI overrides are available on `sync.run`:

- `--log-level {DEBUG,INFO,WARNING,ERROR,CRITICAL}`
- `--log-format {text,json}`

## Log Growth Control

- Logs are written by launchd to:
  - `/tmp/com.edo.journal.out`
  - `/tmp/com.edo.journal.err`
  - `/tmp/com.edo.skip.log`
- The application does not rotate or truncate these files.

## Logger Names

Use module logger names via `get_logger(__name__)`.
Names are mapped to the `journal.*` namespace (for example, `journal.sync.study.db`).
