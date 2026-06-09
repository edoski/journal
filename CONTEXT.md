# Journal Domain Context

This repository syncs focus, training, sleep, media, reminders, and goals into Obsidian journal notes.

## Core Terms

**Daily Note**: One journal note for a calendar day. It owns daily metrics, frontmatter, reflections, context links, daily goals, weekly goal mirrors, reminders, and study-session detail.

**Period Note**: A weekly, monthly, quarterly, or yearly journal note. It owns period metrics plus goal source and mirror sections for that period horizon.

**Goal Horizon**: The planning horizon of a goal: daily, weekly, monthly, quarterly, or yearly. The horizon determines the goal section, period key, note filename, template, carry-forward behavior, and piercing range.

**Goal Source Section**: The canonical section where goals for a horizon are authored and persisted. Examples: WEEKLY goals in a weekly note, MONTHLY goals in a monthly note, YEARLY goals in a yearly note.

**Goal Mirror Section**: A copied view of parent goals inside a child period note. Mirror sections reconcile completion and reopening back to their source goals.

**Pierced Goal**: A parent-horizon goal shown inside a child source section because its deadline or reminder offset makes it relevant soon. Pierced goals preserve source identity and propagate done-state changes.

**Goal Note Target**: The resolved write destination for adding or updating goals: note path, template path, section, horizon, and period key.

**Goal Note Graph**: The relationship between daily, weekly, monthly, quarterly, and yearly notes for goal loading, mirroring, piercing, carry-forward, and source writes.

**Period Window**: The date range and neighboring-period metadata for a period sync. Period windows define current bounds, previous bounds, target date, labels, and filenames.

**Period Presentation**: The prepared chart/table payloads for period metrics. It turns daily aggregates into study, training, sleep, media, and summary sections.

**Metric Snapshot**: A read-only query result for a period or metric history. It is consumed by exploration/dashboard views and should stay independent from note rendering.

**Media Item**: A book or podcast note discovered by frontmatter date and rendered into period MEDIA sections.

**Shortcut Status File**: A JSON payload produced by iCloud Shortcuts. Shortcut status ingestion reads, validates, finalizes, or quarantines these files before exposing typed daily status.

**Runtime Command**: A CLI command bound by the composition root to application services, adapters, and command-specific dependencies.
