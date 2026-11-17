# Tabs

Panels switched by a list: the Settings sections, Home's course tabs, the calendar's Week and Month. `tabs.tsx`, shadcn's Radix tabs; `data-slot` `tabs`, `tabs-list`, `tabs-bar`, `tabs-trigger`, `tabs-content`. The arrow keys move along the list. Tests: `tests/one-tab-bar.test.tsx`.

| Slot | Notes |
|---|---|
| list `default` | a segmented track: full radius, `fill-hover`, padding 2, 32 tall |
| list `line` | shadcn v4's underline tabs: no track or fill; horizontal, 32 tall with 20 between tabs. Settings renders `NavRow` through `TabsTrigger asChild` in a vertical list, which brings its own look and draws no bar |
| bar `line`, horizontal | one 2px full-ink bar at the list's foot under the chosen tab, its box measured from the tab's, sliding to the tab he chooses (transform and width, 200ms ease-out, at once under reduced motion); every underline tab glides, Home's course tabs and the calendar's Week and Month alike (audit 17 Nov 2026, finding 13: Home's bar slid while the calendar's underline faded in) |
| trigger | 28px pill, 13px, muted until active; active on `fill-selected`; no weight change. In a `line` list: bare 13px text the list's height, muted until active, the active one in ink over the list's bar; the focus ring keeps a 4 radius |
| content | fills the rest; Radix makes it focusable, so it shows the 2px ring inset on keyboard focus (the list shows it too while it hands focus to the active tab) |

Sources: shadcn tabs (new-york-v4 `tabs.tsx`, its `line` variant: transparent list, an `after:` bar 2px tall under the active trigger), the ToggleGroup `segmented` look (`toggle-group.md`), macOS System Settings' sidebar list.
