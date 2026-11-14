# Course, exam and path

When a course is new, or exam preparation needs missing information, read the syllabus, assessment instructions or past papers already in the course directory (`list_sources` finds them; `add_sources` registers them). Read what the task needs; do not run an intake survey.

## Exam facts

The exam lives in one object, merged by field:

```json
{"sources": {"syllabus": {"path": "admin/syllabus.pdf", "title": "Syllabus"}},
 "exam": {
  "date": "2026-11-02",
  "format": "Written problems followed by an oral discussion",
  "coverage": "Chapters 1–4, not chapter 5",
  "criteria": ["Explain method choice and justify assumptions"],
  "constraints": ["No calculator in the written part"],
  "unknowns": ["Whether the sample paper reflects this year's exam"],
  "refs": [{"source": "syllabus", "locator": "Assessment"}]
}}
```

A ref cites a registered source, so the example registers the syllabus in the same save; a source registered earlier is cited by its handle.

Record requirements from primary material or the learner's explicit statement; label patterns inferred from past papers as indications. Keep each unresolved doubt in `unknowns` until evidence settles it; a learner's report can set the working convention without establishing which document is current. The `date` drives review scheduling: reviews stay within the time left and never fall after the day before. For a course with several exam sessions, keep the next one the learner is aiming for.

Notation correspondences, resource advice and tentative relationships go in `knowledge` with `uncertain` where unverified; do not duplicate exam facts there. None of this says anything about the learner's understanding; use it to choose depth, practice and review timing.

## Building the path

When a course gets material (a syllabus, slides, lecture notes, exercise sheets, a textbook, past papers), or the learner asks for a plan or a path to the exam, build the path from the material in one save. Read every source first; skim what repeats.

1. **Sources.** Cite only registered sources: `list_sources` finds the course's files and `add_sources` registers them, or register them in the same save under `sources`.
2. **Topics.** One topic per idea or method the exam could check on its own: a definition with its use, a theorem with its proof idea, a method with when to apply it. Worked examples, notation and fine details belong to the topic they serve. Ten to forty topics is typical for a course; a one-page syllabus gives fewer. Give each a `title` in the course's own words, with every piece of math in `$…$` LaTeX, never bare, as for every recorded text (records.md); `refs` to every place the material teaches it (`locator`: page, slide, section or exercise); and `aliases` for other names the material uses. Invent nothing the material does not teach.
3. **Prerequisites.** `needs` holds only true prerequisites: B needs A when B cannot be done or understood without A. Test each link: could the learner work an exercise on B having never seen A? If so it is no prerequisite, whatever the lecture order. Judge B by its definition and the method its exercises use: an equivalent form of B stated through A, proved once B is known, makes no edge (a tree is a connected graph with no cycle; that it has one edge fewer than vertices needs no counting topic). List direct prerequisites only, not ones implied through another.
4. **Competing methods.** Methods that solve the same kind of problem, between which the learner must learn to choose, go in `contrasts` on one side: ridge and lasso, bagging and boosting, a B+ tree and a hash index. A comparison is never a prerequisite.
5. **Scope.** `excluded` is only for what no exam session of the course examines; the next session's scope goes in `exam.arcs` in a course with arcs, else in `exam.coverage`, and a topic outside it stays on the path. When a topic the path holds turns out to be examined by no session, give it `excluded` with the reason instead of removing it: it leaves due reviews, the plan and the run-up, and keeps its history.
6. **Order.** `path`: `order` for the intended sequence (prerequisites first, then the material's order; in a course with arcs, `order` reads as the arcs one after another), `current` for where to start, `basis` saying where the order comes from. Exam facts the material states go in `exam`.

```json
{
  "sources": {"slides": {"path": "material/slides.pdf", "title": "Lecture slides"}},
  "topics": {
    "systems": {"title": "Linear systems", "refs": [{"source": "slides", "locator": "week 1"}]},
    "rank": {"title": "Rank and nullity", "needs": ["systems"], "refs": [{"source": "slides", "locator": "week 3"}]},
    "eigen": {"title": "Eigenvalues $\\lambda$ of $A$", "needs": ["rank"], "refs": [{"source": "slides", "locator": "week 5"}]},
    "power": {"title": "Power iteration", "needs": ["eigen"], "contrasts": ["qr"], "refs": [{"source": "slides", "locator": "week 6"}]},
    "qr": {"title": "QR algorithm", "needs": ["eigen"], "refs": [{"source": "slides", "locator": "week 6"}]},
    "tensors": {"title": "Tensor products", "excluded": "Week 7 is never examined", "refs": [{"source": "slides", "locator": "week 7"}]}
  },
  "path": {"order": ["systems", "rank", "eigen", "power", "qr"], "current": "systems", "basis": "Syllabus order; weeks 1–6 examinable"}
}
```

**Revising.** When material is added or the picture changes, extend the path in place. Keep every handle; merge into existing topics (add `refs`, `needs` and `contrasts`, sending each list whole with its other entries kept); create topics only for ideas the path lacks. Never rename a topic or remove one that has evidence; exclude it instead. In a course with arcs, new topics join arcs as arcs.md, *Placing a new topic*, says; never move a studied topic. A topic missing from `order` is placed by its prerequisites, and the receipt's `placed` says where it went. `resume.path_health` lists studied topics with no title, no place in `order`, no link to another topic or no `refs`; close those gaps when you next touch them.

Show the path only when it helps or when asked where they are; then connect the current step to its purpose and distinguish what was demonstrated from what was only covered, using the levels.

For a deliberate connection to another course, `search` with `all` finds handles in other courses; read the exact item there, compare assumptions and notation, and transfer nothing else.
