# Settings (Proposed)

The settings sheet and its control kit under the Proposed design: `settings-dialog.tsx` draws the frame, `controls.tsx` the groups, rows and fields, `settings-design.ts` carries the design to them (read once by the dialog that hosts the kit: Settings, setup, the connection dialogs). Outside a provider the kit draws Current, so the lesson's figure cards keep their switch.

## Frame

| Slot | Notes |
|---|---|
| sheet | 880 × 600 (max 90vw × 85vh), one `popover` surface, 1px `border`, radius 12, `shadow-2xl`; overlay black 50% (dialog.md) |
| section list | 208px, hairline at its right, padding 8; a `NavSection` titled "Settings" over one `NavRow` per section (nav-row.md: 32px, 13px, active on `fill-selected`) |
| pane | scrolls; padding 24 (32 at the foot); groups 24 apart. No title: the list names the section (a heading that repeats the selected item is noise) |
| close | quiet 32px ✕ at top 12, right 12; Esc closes too |

## Kit

| Part | Notes |
|---|---|
| section hint | 12/16 muted, on the group headers' edge (Keyboard: "Stored on this device") |
| group (`SettingsGroup`) | header 12/16 at 500, muted, sentence case, inset 4; optional description 12/16 muted; then one box, 1px `border`, radius 12, rows split by hairlines |
| row (`SettingsRow`) | min 48px, padding 8 16, label 13/18 over an optional 12/16 muted hint, the control at the right; a dimmed row is 50% |
| field (`SETTINGS_FIELD`) | 28px, radius 8, `input` edge (white 11%), 13px, 2px `ring` on focus; menu triggers add a 14px chevron, number fields right-align tabular figures |
| switch (`Toggle`) | 32 × 20 track, 16px disc inset 2; on: `muted-foreground` track with a `foreground` disc (owner, 2026-09-20: grey with a white disc, never a bright track), off: `input` track with a muted disc; 2px ring offset 2 on focus |
| buttons | `Button` at 28px: quiet for secondary actions (Show text, Change, Refresh), outline for Connect, default (the accent) for Save |
| menus | `MENU_SURFACE` and its items (components/ui/menu.md) |

## What Proposed leaves out of Appearance

Proposed is dark only, in SF Pro, with fixed heading weights and its own palette (the owner's decisions), and the stylesheet ignores those settings there (`appearance.tsx`). Mode (the disabled light row), Background, Reading font, Session names in serif and Heading weight are therefore not shown; Text size and the bold and italic colours stay. What the settings store is unchanged.

## Sources

macOS System Settings and T3 Code's settings (sidebar list, grouped rows with hairlines, label left and control right, 13px), shadcn switch and input (28–36px fields, 2px ring), Apple HIG (no title repeating the selected item; sentence case). research/agent-apps.md for the sizes and tokens.
