# TopicStrip

A course's topics in path order, one segment each, so readiness reads without a number. `data-slot="topic-strip"`. Used by the home's agenda.

| Part | Notes |
|---|---|
| segments | 8px tall, 2px apart, square ends, at least 4px wide; solid (`independent`, `retained`, `transferred`) white 75%, learning (`introduced`, `attempted`, `assisted`) white 30%, not started (`new`) white 10% |
| weak tick | 2px under a segment, `warning`, when the engine calls the topic weak |
| words | a screen reader hears "Topics: solid 2 of 5, learning 2 of 5, not started 1 of 5"; the segments are hidden from it |

Three bands, as intensities of one ink (Few's bullet graph spec: at most five, ideally three); discrete segments for a small range (Apple HIG Gauges). The bands group the engine's level words and judge nothing.
