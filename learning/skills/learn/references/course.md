# Course and exam context

When a course is new, or exam preparation needs missing information, read the syllabus, assessment instructions or past papers that are already in the workspace (`sources SCOPE --scan` finds them; `--add` registers them). Read what the task needs; do not run an intake survey. Keep what you learn in the existing scope through the usual save.

Course facts have fixed homes. The deadline is top-level `exam`; examinable material is top-level `coverage` (text, or `{"text", "refs"}`); the overall aim is `goal`; the path is `route` ([lessons.md](lessons.md)). Assessment requirements are `course_context`, which replaces as a unit (`null` clears it):

```json
{
  "sources": {
    "syllabus": {"path": "university/course/syllabus.pdf"},
    "sample": {"path": "university/course/sample-exam.pdf"}
  },
  "course_context": {
    "assessment": "Written problems followed by an oral discussion",
    "criteria": ["Explain method choice and justify assumptions"],
    "constraints": ["No calculator in the written exam"],
    "unknowns": ["Whether the sample paper reflects this year's exam"],
    "refs": [{"source": "syllabus", "locator": "Assessment section"}],
    "checked_on": "2026-09-18"
  },
  "coverage": {"text": "Examinable: chapters 1–4; chapter 5 excluded", "refs": [{"source": "syllabus", "locator": "Programme"}]}
}
```

Record requirements from primary material or the learner's explicit statement. Label patterns inferred from past papers as indications. `checked_on` is when you actually checked; recheck when new information or a consequential uncertainty warrants it. A conflicting or undated source stays uncertain until resolved; a learner's report can guide the working convention without establishing a document's date or edition. Preserve each independent uncertainty until evidence addresses it. Do not assume an undated file is the "old" or "current" edition.

Notation correspondences, resource advice and tentative relationships belong in `knowledge` with attribution and uncertainty ([records.md](records.md)). Do not duplicate `exam`, `coverage` or requirements into knowledge.

Use this context to choose explanation depth, practice and review timing. It says nothing about the learner's understanding. For a time-bounded oral or mock examination, use the recorded format, criteria, notation, methods and permitted aids; if requirements are unverified, describe the practice as provisional. See [practice.md](practice.md).

For a deliberate connection to another course, `discover "terms"` returns handles across scopes; read the exact knowledge, compare assumptions and notation, and transfer nothing else.
