# Skeleton

A quiet block that holds a part's place while its data is read: the sidebar's Today cards while they are read (`../unit-inbox/now-skeleton.tsx`). A page says it is reading in one sentence instead (`PageReading`, `../page-frame/page-frame.md`). `skeleton.tsx`, shadcn's skeleton (new-york), `data-slot="skeleton"`.

| Part | Notes |
|---|---|
| block | `accent` fill, radius 8, pulsing (Tailwind's `animate-pulse`); the caller gives its size, the size of what it stands for, so nothing moves when the data arrives. Under reduced motion the caller adds `motion-reduce:animate-none` |

Sources: shadcn skeleton; Vercel's Web Interface Guidelines (a skeleton mirrors the final content to avoid layout shift).
