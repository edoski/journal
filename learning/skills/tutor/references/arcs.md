# Arcs

The one text on arcs for every agent that creates, places or moves topics, or teaches: the course map builder, the lesson digest, the grouping pass and every tutor. Each agent reads the sections its job uses. A rule the engine enforces is stated as a fact, with the words of the refusal it gives.

## What an arc is

An arc is a named stretch of a course's path, like a textbook chapter: a group of topics that builds one idea the material treats as a unit, needs nothing from any later arc, and ends where one mixed check across all its topics makes sense. Every topic is in exactly one arc. An arc is not a time slot (no week, no day count, no duration), not a lock (reviews, exam practice and new topics still see the whole course), and not a second copy of a topic (a topic used in several arcs lives in one, and the others reach it through `needs`).

A course has arcs when its record has `arcs`; in a course without them, none of this applies, and no agent adds arcs to it except the pass that groups a course's topics (*Forming arcs*). The fields arrive with the arc record:

- `arcs`: handle → `{"title", "question", "purpose", "refs"}`, merged by handle. `title` is the name on screen; `question` is the focus question every topic in it helps answer; `purpose` is one sentence on what it lets the learner do. The question and the purpose are for agents only. Arc handles share the record's one set of handles, and never change.
- `arc` on a topic: the arc it belongs to. With `arcs`, every topic has one, excluded topics included.
- `path.arcs`: the arcs in study order, each exactly once, sent whole like every list.
- `exam.arcs` and `exam.leaves_out`: the next exam's scope (*Changing arcs*).
- `checkpoint` on an observation: the arc whose check this attempt is an item of (*Teaching with arcs*).
- `arc_change`: `{"reason": "…", "asked": "…"}`, why a save changes arcs, and the learner's own words when the change needs them (*Changing arcs*). The engine stores it only as events in `arc_log`, which is never patched. Its `edges`, `[{"topic", "need", "change": "add" or "drop", "reason"}]`, logs needs the same save adds or drops as one `edges` event, in a course with or without arcs; the save's arc changes, or a later save's through `edges_entry` (that event's index in `arc_log`), refer to it.
- `questions` in course `preferences`: `"asked"` (the default) or `"none"`, for a course that takes no questions.
- `arcs_placed` in the receipt: the arc the engine gave each new topic saved without one.

Order inside an arc comes from `needs`, then `path.order`; the path reads as the arcs one after another, every topic of one arc before every topic of the next. An arc is live while it holds a topic that is not excluded; an arc whose topics are all excluded is hidden.

The current arc is the arc of the topic the learner is on: the topic of the lesson in progress, else `path.current`. When that topic is missing or excluded, it is the earliest arc with an untaught topic, else the last arc. The session's brief names it.

The engine refuses a record or a save that breaks these, with the message quoted:

- a topic with no arc, or one naming no arc: "the course groups its topics into arcs, so every topic needs one";
- a topic that needs a topic of a later arc: "no topic may need a later arc";
- `path.arcs` missing an arc, naming an unknown one or one twice: "path.arcs must list every arc exactly once";
- a single live arc: "one live arc equal to the course adds nothing to orient by; form at least two or none"; an arc with no topic: "no topic is in";
- an arc with no `title`, `question` or `purpose`: "required".

A new or changed `title` names the arc's idea as a plain noun phrase of two to five words, in the material's own words, with math in `$…$`. The engine refuses a label followed by a number ("Part 2", "Unit III", "Capitolo 4", "Second lecture") and a title that ends or starts with a numeral ("Derivatives II", "2. Limits"): "name the arc's idea in the material's words, with no "Part 2"-style labels or numbering". It refuses a title another arc already has: "already names the arc". Neighbours are told apart by their idea: "Derivatives" and "Applications of derivatives", never "Derivatives I" and "Derivatives II". The learner must understand the name after days away: "Limits and continuity", never "Foundations".

A save that adds an arc for a new chapter of the material, with two of its topics:

```json
{
  "arcs": {
    "integrals": {"title": "Integrals", "question": "How do we add up a quantity that changes continuously?", "purpose": "Find areas and accumulated change from rates."}
  },
  "topics": {
    "riemann-sums": {"title": "Riemann sums", "needs": ["limits"], "arc": "integrals"},
    "fundamental-theorem": {"title": "Fundamental theorem of calculus", "needs": ["riemann-sums", "antiderivatives", "continuity"], "arc": "integrals"}
  },
  "path": {"arcs": ["limits-continuity", "derivatives", "applications-of-derivatives", "integrals"]},
  "arc_change": {"reason": "New material: OpenStax Volume 1 chapter 5, Integration"}
}
```

## Forming arcs

This is the grouping pass's job: it forms the arcs of a course that has topics and none. It runs on edges already settled, and never changes `needs`. An edge you think false goes in your doubts with its reason; it is recorded, never applied. Read first: every topic with its `title`, `needs`, `contrasts`, `refs`, `aliases` and `excluded`; every source's headings (table of contents, chapters, syllabus units, lecture weeks, slide ranges, exercise sheets); the exam's `coverage`, `format` and `refs`; `path.order` and `path.basis`.

1. **One home.** Each topic, excluded ones included, sits in exactly one arc. A topic no exam examines (`excluded`) joins the arc whose question it extends, else the latest arc holding its prerequisites. It never forms an arc alone: an arc of excluded topics is hidden and gives nothing to orient by. It is in no exam's scope, so it never makes an arc straddle one.
2. **No topic needs a later arc.** For every topic B that needs A, A's arc is B's or an earlier one: arcs 1 to j together hold every prerequisite of every topic in them. When a topic's theme says one arc but a topic that needs it sits earlier, the edge wins: home the topic in the earliest arc that needs it, just before its first use.
3. **One idea per arc.** Write the arc's focus question before its name. Every topic in it helps answer that question; a topic that serves another arc's question better goes there, if rule 2 allows. A topic's `refs` locator is evidence of its home, not the rule: when its chapter says one arc and its idea another, its idea decides, if rule 2 allows, and the basis says so.
4. **Where to cut**, from these signals, strongest first; keep a boundary only if rule 2 still holds:
   1. The material's own units. A chapter, a syllabus unit, a lecture block or a numbered part that groups at least two of the course's topics is a candidate arc. Read it from the topics' `refs` locators and the sources' headings. Keep the units whole: re-cut or merge one only for rule 2, rule 3 or the size rules, with the reason in the basis. When two units' titles would be confused ("Graphs" next to "Graph algorithms"), name each by the idea that tells them apart; never re-cut them to dodge a name.
   2. The exam's scope, when the material states it. No arc straddles the boundary of an exam whose scope is known now: with a midterm on chapters 1 to 3, a boundary falls after chapter 3, and the midterm's scope goes in `exam.arcs`. A topic outside the scope stays on the path, in its arc; it is not excluded.
   3. Tool, then use. Learning a method and applying it are separate arcs when each has at least two topics ("Derivatives", then "Applications of derivatives").
   4. Cohesion. Inside an arc, topics connect through `needs` or share the focus question; few of them start from nothing inside it, and its prerequisites from outside come from few earlier arcs.
   5. A checkpoint exists. You can write one short mixed check whose items span every topic in the arc and read as one exercise on one idea. If the only honest check is two unrelated checks stapled together, cut there.

   Never form arcs by graph clustering (modularity, Louvain): it is unreliable at this size and reshuffles after one new topic.
5. **Competing methods.** Topics linked by `contrasts` may share an arc when they answer the same question (integration by parts and substitution). Sharing an arc does not mean being taught on the same day, and partners in different arcs are still reviewed side by side.
6. **Size comes from the boundaries, never from a target.**
   - At least two topics per arc. A one-topic arc is allowed only when merging it with either neighbour breaks rule 2 or rule 3, or the material gives it its own chapter and an exam treats it alone; give the reason. Otherwise merge it with the neighbour whose question it serves.
   - Split an arc that holds two consecutive parts which each pass rule 2, each have their own focus question and name, and which the material or the exam treats as separate.
   - Merge two neighbours that share one focus question and that the material treats as one unit.
   - No arc spans more than one unit of the material unless the material joins them.
   - At least two arcs, or none. A course of about five topics usually gets none: form arcs only when the material has two units that each group at least two topics under their own question and boundary. A unit shows in a source's headings or a topic's `refs` locator; a path basis or a course description names none. When the course gets none, say why.
   - When several cuts pass all of this, prefer the one whose arcs need the most even work in lesson steps, else in topics.
   - Semester courses in the references run four to eight chapters (Khan Academy, OpenStax, Math Academy and Brilliant; Fink says four to seven). That is no target. A cut outside that range says in the basis why the material gives that many, and a cut above it first checks whether two neighbours share one question and could merge.
7. **Order.** Arcs follow rule 2; among the orders it allows, the material's order; then the nearer exam's arcs first; then broad before narrow, and tool before use. `path.order` reads as the arcs one after another. List each arc's topics in study order, prerequisites first, then the material's order; the path takes that order.
8. **Names and purpose lines** as *What an arc is* says.
   - A name names the arc's one idea, never a list of its topics: "Sorting", not "Heapsort, quicksort and counting sort". Two phrases joined by "and" pass only as one idea the material names so ("Limits and continuity"). When only a list fits, the arc holds several ideas: find the one question they serve, or cut it (rule 3).
   - Use the material's chapter title when it fits the topics and passes the sort below.
   - Test the names as the learner will read them, before you submit: sort every topic title, shuffled, into the arc names alone. A fresh reader runs the same sort on your answer, and a topic that lands in another arc than its own sends the cut back. Such a topic means its place or a name is wrong. When the topic sits in its own unit of the material, first look for a name of the unit's idea that it reads into; move it out of its unit only when no such name exists and rule 2 allows, and say so in the basis (rule 3). A topic outside its unit that reads as the unit's arc goes back to it, when rule 2 allows. At most one topic may stay a borderline miss, named in the basis with its reason.
   - A purpose line says the one thing the arc lets the learner do, true of every topic in it ("Find the slope of any curve built from familiar functions"), never a list of its topics' tasks. It uses no term the topic titles do not, and promises nothing the material does not teach. Before you submit, read each purpose line against each of its arc's topics in turn; when it is false of one, write it again at the level of the arc's question.

Edge cases:
- A topic that fits two arcs goes where rule 2 forces, else where rule 3 fits best, else with its material locator; never in both.
- A cross-cutting skill (algebraic manipulation, induction, reading a graph) that is a real topic goes in the first arc that needs it, or in an opening arc when the material opens with it. A habit of choosing between methods is no topic: `contrasts`, mixed reviews and the arc check carry it.
- With no prerequisite edges, boundaries come only from the material's locators and rule 3.
- A project course with branches gets one arc per branch, named for what the branch does in the material's words, beside its code name when the learner knows it by that ("Payments service, billing-api" says more than "The billing-api repository"). When every topic of an arc carries the same leading label ("Eve:"), the pass's code drops it from their titles, since the arc now names it.

Worked example, an algorithms course with true edges and a textbook's contents (Foundations: ch. 2 Getting started, ch. 3 Growth of functions, ch. 4 Divide and conquer; Sorting: ch. 6 Heapsort, ch. 7 Quicksort, ch. 8 Sorting in linear time; Data structures: ch. 11 Hash tables, ch. 12 Binary search trees, ch. 13 Red-black trees), with treaps (a chapter 13 problem) excluded:
1. *Analysing algorithms* (ch. 2 to 4): loop invariants, asymptotic notation, recurrences, master theorem. Its question: "How do we show an algorithm is correct and say how fast it runs?" Chapter 3 holds one topic, so it joins the neighbours whose question it serves. Insertion sort and merge sort sit in chapter 2, but the name sort puts them in *Sorting*, and nothing here needs them, so they move there. The part's own title, "Foundations", fails the days-away test.
2. *Sorting* (ch. 6 to 8, with 2.1 and 2.3): insertion sort, merge sort, heaps, heapsort, quicksort, the comparison lower bound, counting sort. Heaps would sort into *Data structures* by name, but heapsort needs them, so rule 2 homes them here, just before their first use: the one explained miss.
3. *Data structures* (ch. 11 to 13, with 6.5): priority queues, hash tables, binary search trees, red-black trees, treaps. Priority queues (6.5) need heaps, which come earlier, and serve this arc's question, "How do we store a set so we can find, add and remove items fast?", so they move here. Treaps join the arc whose question they extend.

Three arcs, below the usual four to eight, because the course covers three parts of one book; the basis says so. Every edge passes rule 2, every name passes the sort with one explained miss, and every arc has a check that reads as one exercise.

## Placing a new topic

A topic created in a course with arcs joins an arc; arcs are never re-cut to make room for it.

- Test each of its `needs` first: could the learner work an exercise on it having never seen that prerequisite? Keep only the needs that pass.
- Its range runs from the last arc holding one of its prerequisites to the first arc holding a topic that needs it. Give it `arc` when the material or the lesson says where it belongs and that arc lies in the range: the arc whose focus question and material locator it shares. Otherwise leave `arc` out: the engine puts it in the current arc when the range allows, else at the nearer end of the range, and `arcs_placed` in the receipt names the arc. When your answer has no field for `arc`, state none; the code and the engine place the topic.
- An empty range means a new edge points backward, and the engine refuses it: "drop the need that fails the prerequisite test, or place it with "arc"". Most such edges are false; test it again and drop it if it fails. If it holds, home the new topic in the earliest arc that needs it, even if its theme belongs later, as long as its own prerequisites sit no later. If they do, save the topic without that edge and record the edge in `arc_change.reason`. Never move a studied topic to make room.
- **A new arc** only when new material carries its own unit heading (a chapter, a syllabus unit, a numbered part) covering at least two new topics, and no existing arc's focus question fits them. It gets a `title`, `question` and `purpose`, its place in `path.arcs` where its topics' prerequisites and the material's order allow, and an `arc_change.reason` naming the unit. Otherwise a new upload's topics join existing arcs, the one the learner is in included; a chapter often runs across several lectures.
- A topic title never repeats a label its arc already names: in an arc titled "Eve", "Deploy pipeline", never "Eve: Deploy pipeline".

## Changing arcs

Every save that adds, removes, renames, rewords or reorders arcs, or moves a topic to another arc, carries `arc_change` with its `reason`; the engine refuses one without it ("say why in "arc_change"") and logs every change with its day and reason. A save that carries only `arc_change` records a note, which is how a conflict between the material and the arcs is kept: keep the arcs and say why in the note. A placement of a new topic is no move.

An arc is held when it holds a studied topic (taught, named by any attempt, or `path.current`) or is the current arc. What may change without the learner: a new topic's place, a new arc for a new unit, a move of an unstudied topic between arcs neither of which is held, the name of an arc that is not held, and a `question` or `purpose` reworded with a reason. These need the learner's own request for a re-plan, quoted in `arc_change.asked`, and only a tutor talking with the learner can make them:

- moving a studied topic: "a studied topic changes arc only when he asks for a re-plan";
- moving any topic into or out of a held arc: "only he can ask to re-cut it, so place new topics instead";
- removing a held arc, dissolving every arc included: "only he can ask to remove it";
- renaming a held arc, or changing the order of two arcs when either is held;
- forming arcs in a course that already has studied topics.

A name changes only before any of its topics has evidence, or to fix a factual error. Handles never change. An arc left with no topic is removed by the engine, and when fewer than two live arcs are left the course has none. Forgetting an arc that still holds topics is refused: "move them to another arc first, or keep the arc".

**The exam.** `exam.arcs` names the next exam's arcs, a run of consecutive live arcs in `path.arcs` order ("exam.arcs must be a run of consecutive live arcs"); with it absent the whole course is in scope. `exam.leaves_out` lists topics of those arcs that this exam leaves out, for an exam that covers part of an arc; it never lists every topic of an arc ("exam.leaves_out holds every topic of"; drop that arc from `exam.arcs` instead). A new exam date comes with its scope: a save that changes or removes `exam.date` states `exam.arcs`, a list or `null` for the whole course, and `exam.leaves_out` when it leaves topics of those arcs out ("exam.date changes and exam.arcs does not"). Stating `exam.arcs` replaces the scope whole: `leaves_out` is cleared unless the same save states it. A topic outside the next exam's scope stays on the path, keeps its reviews and is planned after the scoped topics; it is not excluded. `excluded` is only for what no exam session of the course ever examines.

## Probing an arc's start

When the lesson's goal opens an arc (the brief marks the current arc `first`), the earlier topics the arc needs, its `entry`, are one more strand to bracket, lapsed topics first. The lesson is planned from your map, so nothing recalls them again.

## Teaching with arcs

- **An arc's first lesson** (the brief marks the current arc `first`). The lesson's one-line goal is the arc's purpose line, in your words: no other preamble, and teaching starts in the same turn. The probe has already measured the arc's entry.
- **Reviews and exam practice mix arcs.** Today's review draws from every arc, competing methods side by side across arcs, and a checked arc keeps its reviews. The run-up and mock exams mix every arc in the exam's scope. An arc's check is not exam preparation.
- **The arc check** is offered, never required, and locks nothing: the next arc's topics start whether or not it is taken. Offer it once, as the next-step line of the close of the lesson whose save made the arc ready (the brief's `arcs_ready` lists ready arcs): it points to **Check it** on the course page or to the next session, and never asks for a yes in this one. The check asks one unaided item per live topic in mixed order, plus a choose-the-method item for each `contrasts` pair inside the arc or reaching into an earlier arc. Each item is an ordinary attempt with `checkpoint` set to the arc ("tag a check item with the arc it checks"), counted by the usual rules: an item on a topic due today is its review. A miss follows the relearn rules, and a fresh parallel item rechecks it in the same session or the next.
- **A course that takes no questions** (`questions: "none"`) has no check: never offer one and never set `checkpoint`. When the learner asks for no questions in a course, set `questions` to `"none"` and say how to teach instead in `question_style`.
- **Where the learner stands.** Say an arc's standing in words, never counts or percentages: not started, learning, ready for its check, checked, and that it needs them when one of its topics does.
- **Why a topic comes now.** New topics come from the earliest arc with topics left and the next one; a topic two arcs on waits for its turn. An arc that needs nothing from the others gives a new topic only when they stall: when neither of those two arcs has a topic ready. That earliest arc is the current arc while he studies in order; once he studies ahead, the current arc is the later one he is in. The brief's `starts_why` gives each planned start its reason: `next` (the next topic of its arc he can start), `after` (it waited for the `needs` or competing methods, `partners`, it names to be solid), or `early` (from a later `arc` while the earliest arc with topics left, `behind`, waits on the topics in `waiting_on`; `exam` when the exam's pace needs it). When you start a topic whose reason is `early`, name the reason in one line.
- **Open notes.** The brief lists the arc notes since the arcs were last formed: refused edges and conflicts with the material. Raise one with the learner only when it bears on the lesson; only the learner can ask for a re-plan.
