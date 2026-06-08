# Shortcut Status Payload Contracts

This document defines the canonical payload shape expected by journal sync for iCloud Shortcut status files.

## Files and Payloads

### `sleep_status.json`
Single JSON object with required keys:

- `date`: `YYYY-MM-DD`
- `start`: timestamp string
- `end`: timestamp string
- `sleep_min`: numeric minutes
- `awake_min`: numeric minutes
- `awake_count`: integer

Example:

```json
{
  "date": "2026-02-07",
  "start": "2026-02-06T23:30:00+0000",
  "end": "2026-02-07T06:45:00+0000",
  "sleep_min": 435,
  "awake_min": 12,
  "awake_count": 2
}
```

### `workout_status.json`
Either a single object or an array of objects.

### `stretching_status.json`
Either a single object or an array of objects.

### `meditation_status.json`
Either a single object or an array of objects.

Training object keys:

- `date`: `YYYY-MM-DD` (required)
- `start`: `HH:MM` (optional)
- `end`: `HH:MM` (optional)
- `duration`: numeric minutes (optional; defaults to `0`)
- `type`: activity label (optional; defaults by file)

Example array:

```json
[
  {
    "date": "2026-02-07",
    "start": "18:00",
    "end": "19:00",
    "duration": 54,
    "type": "Traditional Strength Training"
  }
]
```

### `activity_status.json`
Single JSON object:

- `date`: `YYYY-MM-DD` or empty
- `activity_ipad`: newline/comma separated app duration entries
- `activity_iphone`: newline/comma separated app duration entries

Example:

```json
{
  "date": "2026-02-07",
  "activity_ipad": "YouTube (45m)\nSafari (20m)",
  "activity_iphone": "Instagram (12m)"
}
```

## Failure Semantics

- Missing file: ignored.
- Stable iCloud files are first moved into local pending cache, then parsed from
  there.
- Transient iCloud claim/read errors: source is skipped for this run and retried
  on a later run.
- Invalid JSON: claimed file is archived under the local status invalid cache,
  source is skipped.
- Invalid schema: claimed file is archived under the local status invalid cache,
  source is skipped.
- Date mismatch: payload is ignored for that day and source continues normally.
- One invalid source never aborts full daily sync.
