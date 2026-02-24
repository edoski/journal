# GRADES.md Schema and Formula

`GRADES.md` is the local source of truth for university exam tracking and final-grade projection.

## Command

```bash
python -m sync.run grades sync [--path /abs/path/to/GRADES.md]
```

Default path resolution:

- `GRADES_PATH` env override
- fallback: `<VAULT_DIR>/university/GRADES.md`

## Canonical Sections

Year sections are strict and dynamic:

- `## YEAR 1`
- `## YEAR 2`
- `...`

Overall section is strict:

- `## OVERALL`

## Canonical Table Headers

Year table header:

```text
| EXAM | CFU | GRADE |
```

Overall table header:

```text
| AVERAGE GRADE | % | CFU | LODE | BONUS | THESIS | FINAL |
```

## Grade Tokens

- Numeric grades: integer from `18` to `30`
- Lode: `30L` (and equivalent forms like `30 L`, `30 e lode`)
- Pass/fail: `ID`

Validation rules:

- Empty `GRADE` means the exam is not done yet.
- Non-empty `GRADE` must be `ID`, `30L`, or integer `18..30`.

## Computation Rules

- `ID` counts toward total done `CFU` and does not affect weighted average.
- `30L` is valued as numeric `30` for weighted average.
- `LODE` in `OVERALL` is the count of done `30L` exams.
- `BONUS = floor(LODE / 3)`.
- `AVERAGE GRADE` is the global weighted average over all done graded exams.
- `% = AVERAGE_GRADE / 30`.
- `THESIS` is manual input preserved from the existing OVERALL row.
- `FINAL = round_half_up(110 * (average_raw / 30) + BONUS + THESIS + STATUS_BONUS)`.
- `STATUS_BONUS` is currently fixed to `0`.

Precision policy:

- Engine uses `Decimal` internally.
- Displayed `AVERAGE GRADE` and `%` are rounded to 2 decimals.
- `FINAL` is rounded once at the end (half-up).
