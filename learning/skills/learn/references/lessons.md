# Tasks, frames and the study route

Two levels of path exist. A **task** is one activity (an exercise, a proof, a chapter's questions) with a stable `frame` and a small `plan` inside it. The **route** is the course-level path: a handful of modules or milestones toward the exam, kept in the scope record and shown in every `resume` briefing. Neither is a dashboard; both exist so that the next session can continue where this one stopped.

## Task frame and plan

```json
{
  "tasks": {
    "exercise-5": {
      "task": "Exercise 5: solve and justify uniqueness",
      "frame": {
        "within": "Module 1 / Linear systems / Worksheet 1",
        "goal": "Explain why the solution is unique",
        "completion": "Justify uniqueness for the original system",
        "topics": ["uniqueness"],
        "refs": [{"source": "sheet", "locator": "Exercise 5"}]
      },
      "plan": {
        "status": "proposed",
        "current": "collisions",
        "nodes": {
          "columns": {"label": "Read Ax as a combination of columns"},
          "collisions": {"label": "Understand information loss", "needs": ["columns"]},
          "uniqueness": {"label": "Return to the original uniqueness argument", "needs": ["collisions"]}
        }
      },
      "topics": ["invertibility"],
      "why": "Build the concrete meaning needed for the uniqueness argument",
      "pending_question": "Why can distinct inputs produce the same output?"
    }
  }
}
```

The frame is what the activity is for and what finishing means; it survives detours. The plan's `current` node is the position; `needs` are true prerequisites, not presentation order. `proposed` is your suggestion; `agreed` means the learner's request or response supports it. Update the plan when the route changes, not every message. When the completion condition is met, set the task to `null` and keep the final attempt, its assistance and its locator in an observation. Do not leave a solved question active or turn the frame into a result summary.

## The course route

When the learner asks for a plan, a study map, a path to the exam, or hands you the syllabus and slides, build the route from the material and save it:

```json
{
  "route": {
    "status": "proposed",
    "basis": "Syllabus order; weeks 1–4 examinable",
    "current": "rank",
    "nodes": {
      "systems": {"label": "Linear systems", "topics": ["linear-systems"], "done": true},
      "rank": {"label": "Rank and nullity", "needs": ["systems"], "topics": ["rank"], "refs": [{"source": "slides", "locator": "week 3"}]},
      "eigen": {"label": "Eigenvalues", "needs": ["rank"], "topics": ["eigen"]}
    }
  }
}
```

Keep it to the nodes that change what you teach next: five to fifteen, not every exercise. Register the sources first (`sources --scan`, `--add`) and create the topics the nodes reference. Move `current` as the learner advances and mark `done` nodes; a `done` node is covered, not mastered. Revise the route when evidence or the learner changes the picture; replace it as a unit. `resume` returns the position (current node, its prerequisites, done nodes, order) in `briefing.route`, and knowledge linked to the current node's topics is included automatically.

Show the route only when it helps or when asked where they are; then connect the current step to its purpose and distinguish covered ground from proposed next steps. A learner asking for a document gets one through the file tools; the automatic lesson mirror is a reading surface, not the plan.

## Continuity

Retrieve the task and briefing once per activity. Teach the next useful step without replaying the plan. Preserve the original purpose across follow-ups and prerequisite detours: a detour patches `why` and `pending_question`, not the frame. Keep the wider course understanding in `knowledge` (notation, resources, unresolved choices) rather than duplicating it into tasks. When asked "what do you remember", answer from the loaded state in plain language.

In Pi, learner annotations live in the protected section of the lesson note; corrections update your teaching, never their notes. If publication reports a conflict, keep teaching readable and resolve it without overwriting learner text.
