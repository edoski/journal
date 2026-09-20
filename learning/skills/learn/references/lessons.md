# Lesson purpose and route

Keep the underlying activity stable while the teaching moves. A task's `frame` explains where the activity belongs, its goal and what finishing means. Its ordinary checkpoint fields hold the changing question, assistance and reason for a detour. A short answer needs no plan object; a substantive learning block benefits from a small route whose dependencies can be rendered as Mermaid when useful.

Enduring understanding about material, resources, notation or useful relationships belongs in `knowledge`; current exercise goals, routes and continuation details belong in tasks. A request for a rough course picture does not require a formal route or a persistent orientation task. Let a useful map emerge from the material and conversation, preserve uncertainty, and revise it when later evidence changes the picture. Draw it when requested; do not create a compulsory curriculum structure, progress dashboard or intake interview. Completing an exercise does not remove reusable knowledge.

Before planning, use the request, relevant materials, evidence and preferences already available. Ask when a consequential uncertainty remains—for example, conceptual understanding versus exam practice would lead to different lessons. Recommend an approach alongside a focused question. Do not ask the learner to design the curriculum or repeat known preferences. A specific request may already settle the approach. Retain an unresolved choice in the task if interrupted; clear it when resolved.

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
        "observations": ["o5"],
        "refs": [{"source": "sheet", "locator": "Exercise 5"}]
      },
      "plan": {
        "status": "proposed",
        "nodes": {
          "columns": {"label": "Read Ax as a combination of columns"},
          "collisions": {"label": "Understand information loss", "needs": ["columns"]},
          "uniqueness": {"label": "Return to the original uniqueness argument", "needs": ["collisions"]}
        },
        "current": "collisions"
      },
      "topics": ["invertibility"],
      "why": "Build the concrete meaning needed for the uniqueness argument",
      "pending_question": "Why can distinct inputs produce the same output?"
    }
  }
}
```

Use existing source/topic/observation handles; the example names are illustrative. Frame fields are optional: retain only what matters. Plan node keys are local to the task; `needs` names prerequisites, not every preceding presentation step. Nodes may reference `topics`, `observations` and `refs` when needed. Dependencies must be acyclic. Default context includes the frame and current node's direct prerequisites, with their linked evidence; deeper retrieval remains available.

`proposed` is a suggested route; `agreed` requires the learner's request or response to support that route. An inferred reconstruction stays proposed, with a brief `basis` if helpful. Showing a plan does not establish agreement. A changed route replaces the current plan rather than accumulating versions. Preserve unaffected steps and the destination when adding a detour. Update at meaningful changes, not every message.

The plan describes intended teaching, not mastery. Link to observations for what was explained, attempted with help, independently demonstrated or remains uncertain; current learner interpretations belong in topic assessments, not node mastery flags. Completing a task does not establish understanding. Draw the visible diagram from the saved route and evidence when needed. On ordinary continuation, teach the next useful step without replaying the plan. When the learner asks where they are, connect the current step back to its purpose and distinguish established progress from proposed next steps.

If the learner explicitly requests a standalone course map or another document, publish it through the available file tools and register its source when useful. Automatic lesson mirroring is a reading surface; it does not replace durable knowledge or require indexing every generated lesson.
