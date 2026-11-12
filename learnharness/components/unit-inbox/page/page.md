# Page

A topic is a place. On Learning and Review the row (`data-testid="unit-row"`) is a two-line card: the title with its one status, then one 12px line of facts (the course when every course is listed, why the engine calls it weak, else its standing in words and how many sessions it holds). On Known it is one 32px line with its return. A click opens the topic's page, `/unit/<course>/<topic>` (`unit-page.tsx`): the course and shelf, the title, the standing and review in words, where it slips, Study this, its sessions newest first (lesson or practice, Your turn or how long ago), and the topics it builds on and leads to, each opening its own page.

Height: 52px cards, 32px known rows. The page is the topic's node from the course map, with its edges as links.

Sources: T3 Code's card rows (`SidebarThreadRow.tsx`, three lines in the inbox, one on the shelves), Khan Academy and RemNote unit pages, the course map's topic detail (`components/course-map/topic-detail.tsx`).
