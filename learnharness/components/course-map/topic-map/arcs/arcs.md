# Arcs on the map

What the arc candidates of the Course map switch (`../map-style.ts`) share: `regions`, `bands` and `overview`. Edo, 16 Nov 2026, on Canvas tree with Linear Algebra's 17 topics and Calculus's 25: "there's just so much visually going on"; he asked for "an extra layer of grouping by arcs", so the map parses at a high level instead of reading as "one big blob". The same day: the arc strip reads as "a disordered vomit row" with no clear first and next.

Research (16 Nov, the pass's scratchpad): common region (a bounded area) groups more strongly than proximity alone (Palmer 1992); group labels doubled recall (Jianu et al. 2014); collapsing groups helps overview tasks and hurts topic tasks (Archambault, Purchase and Pinaud 2010), so the arc he is in always stays open; Graphviz `clusterrank=local` and ELK's merged hierarchy ports for edges that leave a group. d3-dag cannot cluster, so regions compose one layout per arc rather than add ELK (466 KB gzipped).

## What every candidate does

- **The whole course, never one arc.** A `grouped` skin (`../map-skin.ts`, `drawingOf`) draws every topic of a course with arcs. The arc a page shows (Home's Today row he points at, the course page's arc) is framed by the camera, as `framed` frames topics; the overview also opens it.
- **The strip gives way.** Home's and the course page's arc strip is not drawn: the map names the arcs, in order (`home-map.tsx`, `split-course.tsx`).
- **Each arc is numbered** in study order and named by its pill (`ArcMark`: the number, then `ArcPill` with its ring and whole name), so first and next read at a glance. Arcs side by side keep study order left to right (`layeredDrawing`'s `order`).
- Canvas tree's grammar inside and between arcs (`../canvas/canvas-layout.ts`, `layeredDrawing`): centred ports, one bracket per source, lanes 24 apart, implied needs left to their chain.
- Focus lights a topic, what it needs and what it leads to, as Canvas tree does; an arc holding the topic in focus raises its border, and a line between arcs rises when a need of the topic runs along it. Nothing moves on hover.
- A course without arcs, or with one, draws as Canvas tree.

## Parts

| Part | File |
|---|---|
| Arc regions layout: each arc alone, the arcs as boxes, one line per pair of arcs | `arc-layout.ts` |
| An arc's number and pill | `arc-mark.tsx` |
| A region, or a folded arc's card | `arc-region.tsx` |
| The line between two arcs | `arc-link.tsx` |
| The skin for regions and overview | `arc-skin.ts` |
| An arc opened on the map, for the overview | `arc-open.ts` |
