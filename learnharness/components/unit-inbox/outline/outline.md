# Outline

The sidebar is the course's outline. A topic is one 32px `NavRow` (`data-testid="unit-row"`): a 16px chevron, the title, one trailing fact. A click folds its sessions open in place, 16px deeper than the title, newest first, each the Proposed session row with its menu; the last item, "Study this" in the accent, starts a new session on the topic. Opening a session keeps its topic open.

Height: 32px for every row, so long courses stay dense. The course is not named on the row: with every course listed, a topic's course shows only on its sessions' pages.

Sources: T3 Code's project folders and threads (`SidebarProjectFolderHeader.tsx`), Apple HIG Sidebars (two levels at most, disclosure for groups).
