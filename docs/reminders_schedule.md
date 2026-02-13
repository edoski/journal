# REMINDERS.md Schedule Grammar

The `SCHEDULE` column in `REMINDERS.md` uses strict canonical tokens.

## Allowed Values

- `DAILY`
- `WEEKLY:MON|TUE|WED|THU|FRI|SAT|SUN`
- `WEEKLY_ODD:MON|TUE|WED|THU|FRI|SAT|SUN`
- `WEEKLY_EVEN:MON|TUE|WED|THU|FRI|SAT|SUN`
- `MONTHLY:LAST_DAY`
- `YEARLY:MM-DD` (must be a real date)

## Rules

- Case-sensitive and exact token format.
- `DAILY` is standalone and has no `:VALUE`.
- Non-`DAILY` schedules must include `:VALUE`.
- Invalid schedules fail parsing.

## Valid Examples

- `DAILY`
- `WEEKLY:MON`
- `WEEKLY_ODD:SUN`
- `WEEKLY_EVEN:SAT`
- `MONTHLY:LAST_DAY`
- `YEARLY:12-31`

## Invalid Examples

- `daily`
- `DAILY:MON`
- `WEEKLY:mon`
- `WEEKLY:FUNDAY`
- `MONTHLY:END`
- `YEARLY:1231`
- `YEARLY:02-30`
