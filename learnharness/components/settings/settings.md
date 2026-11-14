# Settings

The settings sheet and its control kit: `settings-dialog.tsx` draws the frame, `controls.tsx` the groups, rows and fields. Settings, setup and the connection dialogs share the kit. The lesson's figure cards use `Toggle` with a disc icon, which draws a plain button in the switch role instead of the `Switch`.

## Frame

| Slot | Notes |
|---|---|
| sheet | 880 × 792 (max 90vw × 90vh): the tallest section, Keyboard, fits whole in the owner's 1512 × 982 window, so no section scrolls there; one `popover` surface, 1px `border`, radius 12, `shadow-2xl`; overlay black 50% (dialog.md) |
| section list | 208px, hairline at its right, padding 8; vertical `Tabs` (components/ui/tabs.md): a `NavSection` titled "Settings" over a `line` `TabsList` whose triggers render one `NavRow` per section (nav-row.md: 32px, 13px, active on `fill-selected`); ↑/↓ move between sections |
| pane | scrolls only in a window shorter than the sheet, with no visible scrollbar (the app shows none); padding 24 (32 at the foot); groups 24 apart. No title: the list names the section (a heading that repeats the selected item is noise) |
| close | quiet 32px ✕ at top 12, right 12; Esc closes too |

## Kit

| Part | Notes |
|---|---|
| section hint | 12/16 muted, on the group headers' edge (Keyboard: "Stored on this device") |
| group (`SettingsGroup`) | header 12/16 at 500, muted, sentence case, inset 4; optional description 12/16 muted; then one box, 1px `border`, radius 12, rows split by hairlines |
| row (`SettingsRow`) | min 48px, padding 8 16, label 13/18 over an optional 12/16 muted hint, the control at the right; a dimmed row is 50% |
| menu | `SelectTrigger size="sm"` (components/ui/select.md): 28px, radius 8, `input` edge, 13px, for any setting with a fixed set of choices (Text size: every size the record takes, the factory one reading "16 px, default"; picking it unsets the field). A choice is never typed |
| colour field (`ColorField`) | a 48 × 28 outline, radius 8, `input` edge, holding a 16px round swatch of the colour (of the ink the default resolves to while unset), the 2px `ring` on keyboard focus, the selected fill while open. It opens a `Popover` (padding 8, aligned to its end) of the app's inks in a `SwatchGrid` (components/ui/swatch-grid.md): Apple's dark-mode system colours Red, Orange, Yellow, Green, Mint, Cyan, Blue, Purple, Pink and Brown in two rows of five, each at least 4.5:1 on the background (tested; Indigo is under it, Teal sits between Mint and Cyan). Arrows walk the swatches, ↑ ↓ by row; Enter or a click commits the ink once and closes the panel (round 5: the native `<input type="color">` drew the system picker). Beside it a quiet 28px Default clears the choice (stores null), disabled while the default is in use; the row's hint then reads "Same as the text". No hex is shown, and none is typed |
| switch (`Toggle`) | the shadcn `Switch` (components/ui/switch.md): 32 × 20 track, 16px disc inset 2; on: `muted-foreground` track with a `foreground` disc (owner, 2026-09-20: grey with a white disc, never a bright track), off: `input` track with a muted disc; 2px ring offset 2 on focus; its tooltip is a `Hint` |
| disclosure | a prompt part's Show text / Hide text is a `Collapsible`; the original and your version are `Textarea`s |
| buttons | `Button` at 28px: quiet for secondary actions (Show text, Change, Refresh), outline for Connect and Use this account, default (the accent) for Save |

## What Settings and Accounts leave out

There is no Tutor section: research, interactive demos, figures and reading PDFs are always on (owner, 2026-11-14), so nothing switches a tool off. Every agent runs Claude Opus 5.5 at high effort (owner, 2026-11-14), so there are no model or thinking rows either. The only choice left is the Claude account they run on: in Accounts each signed-in Claude account offers Use this account, and the one in use reads "In use" (12/16 muted) instead.

## Accounts

The Subscriptions group's box holds rows parted by hairlines, each padded 12 × 16 like the settings rows: Claude with Refresh, then one row per account, then the note "Your lessons run on your Claude plan through Claude Code and count toward its limits." as the last row (round 4 found it crammed 8px under the last account).

| Part | Words |
|---|---|
| name (13/18, full ink) | the email the account signs in with, from Claude Code or its config folder's `.claude.json` (round 4: T3 Code's one-letter names "Claude · A/E/F" meant nothing); without an email, T3 Code's name for it. When two rows share an email, each adds ", named E in T3 Code" in muted ink so they never read the same |
| sign-in (12/16 muted) | "Signed in through Claude Code", with "on the Max plan" when Claude Code reports the plan; the other states say what to do |
| usage (12/16 muted) | no percentage (Edo's ruling): "Plenty left this week", "About half left this week", "Little left this week" or "Nothing left this week", then ", resets Tuesday 13:00"; at a limit, "At its limit until Tuesday 04:00". The bands are thirds of what Claude Code reports, the coarsest split that tells carrying on from watching it from switching soon |

`src/agent/claude-accounts.ts`, the setup-token route and the switch are unchanged: only the words and the spacing moved. An account whose plan or Claude Code version lacks the model shows one danger line saying so (`claude-model-missing`); nothing falls back to another model. The sign-in dialog (`setup-dialog.tsx`) shows the same Claude rows and closes once the account in use is signed in.

## What Appearance leaves out

The app is dark only, in SF Pro, with fixed heading weights and its own palette (the owner's decisions), and the stylesheet owns those (`appearance.tsx`). Mode (the disabled light row), Background, Reading font, Session names in serif and Heading weight are therefore not shown; Text size and the bold and italic colours stay. What the settings store is unchanged.

## Sources

macOS System Settings and T3 Code's settings (sidebar list, grouped rows with hairlines, label left and control right, 13px), shadcn switch and input (28–36px fields, 2px ring), Apple HIG (no title repeating the selected item; sentence case). research/agent-apps.md for the sizes and tokens.
