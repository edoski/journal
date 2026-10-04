# Course, exam and path

When a course is new, or exam preparation needs missing information, read the syllabus, assessment instructions or past papers already in the course directory (`list_sources` finds them; `add_sources` registers them). Read what the task needs; do not run an intake survey.

## Exam facts

The exam lives in one object, merged by field:

```json
{"exam": {
  "date": "2026-11-02",
  "format": "Written problems followed by an oral discussion",
  "coverage": "Chapters 1–4; chapter 5 excluded",
  "criteria": ["Explain method choice and justify assumptions"],
  "constraints": ["No calculator in the written part"],
  "unknowns": ["Whether the sample paper reflects this year's exam"],
  "refs": [{"source": "syllabus", "locator": "Assessment"}]
}}
```

Record requirements from primary material or the learner's explicit statement; label patterns inferred from past papers as indications. Keep each unresolved doubt in `unknowns` until evidence settles it; a learner's report can set the working convention without establishing which document is current. The `date` drives review scheduling: reviews stay within the time left and never fall after the day before. For a course with several exam sessions, keep the next one the learner is aiming for.

Notation correspondences, resource advice and tentative relationships go in `knowledge` with `uncertain` where unverified; do not duplicate exam facts there. None of this says anything about the learner's understanding; use it to choose depth, practice and review timing.

## Building the path

When the learner asks for a plan, a study map or a path to the exam, or hands you the syllabus and slides, build the path from the material in one save:

1. Register the sources you used.
2. Create the topics: one per idea or method you would check separately, with `title`, `refs` to where it is taught and `needs` for true prerequisites (not presentation order). Ten to forty topics is typical for a course; group fine details under one topic.
3. Set `path`: `order` for the intended sequence, `current` for where to start, `basis` saying where the order comes from.

```json
{
  "topics": {
    "systems": {"title": "Linear systems", "refs": [{"source": "slides", "locator": "week 1"}]},
    "rank": {"title": "Rank and nullity", "needs": ["systems"], "refs": [{"source": "slides", "locator": "week 3"}]},
    "eigen": {"title": "Eigenvalues", "needs": ["rank"]}
  },
  "path": {"order": ["systems", "rank", "eigen"], "current": "systems", "basis": "Syllabus order; weeks 1–4 examinable"}
}
```

Revise it when the material or the learner changes the picture. Show the path only when it helps or when asked where they are; then connect the current step to its purpose and distinguish what was demonstrated from what was only covered, using the levels.

For a deliberate connection to another course, `search` with `all` finds handles in other courses; read the exact item there, compare assumptions and notation, and transfer nothing else.
