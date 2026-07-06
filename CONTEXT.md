# Journal Domain Context

This repository syncs focus, training, sleep, and media into Obsidian journal notes.

## Core Terms

**Daily Note**: One journal note for a calendar day. It owns daily metrics, frontmatter, reflections, context links, and study-session detail.

**Period Note**: A weekly, monthly, quarterly, or yearly journal note. It owns period metrics, media summaries, and reflections for that period.

**Period Window**: The date range and neighboring-period metadata for a period sync. Period windows define current bounds, previous bounds, target date, labels, and filenames.

**Period Presentation**: The prepared chart/table payloads for period metrics. It turns daily aggregates into study, training, sleep, media, and summary sections.

**Metric Snapshot**: A read-only query result for a period or metric history. It is consumed by exploration/dashboard views and should stay independent from note rendering.

**Media Item**: A book or podcast note discovered by frontmatter date and rendered into period MEDIA sections.

**Shortcut Status File**: A JSON payload produced by iCloud Shortcuts. Shortcut status ingestion reads, validates, finalizes, or quarantines these files before exposing typed daily status.

**Runtime Command**: A CLI command bound by the composition root to application services, adapters, and command-specific dependencies.
