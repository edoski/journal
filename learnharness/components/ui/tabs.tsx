"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/** shadcn tabs on the Proposed tokens (spec: tabs.md). `default` is the
 *  segmented track the confidence and mode switches draw; `line` is
 *  shadcn v4's underline tabs: no track, the chosen tab underlined by one
 *  bar that slides between tabs (the settings section list, vertical,
 *  renders NavRow through `TabsTrigger asChild`, which brings its own look,
 *  and draws no bar). */

/** The tabs' orientation, which a `line` list reads to draw its bar. */
const Orientation = React.createContext<"horizontal" | "vertical">("horizontal")

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <Orientation.Provider value={orientation}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-orientation={orientation}
        orientation={orientation}
        className={cn(
          "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
          className
        )}
        {...props}
      />
    </Orientation.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:items-stretch",
  {
    variants: {
      variant: {
        default: "gap-0.5 rounded-full bg-fill-hover p-0.5 group-data-[orientation=horizontal]/tabs:h-8",
        line: "relative gap-0.5 bg-transparent group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=horizontal]/tabs:gap-5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const orientation = React.useContext(Orientation)
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      {variant === "line" && orientation === "horizontal" && <TabsBar />}
    </TabsPrimitive.List>
  )
}

/** A horizontal `line` list's underline: one 2px bar under the chosen tab
 *  that slides to the next one chosen (200ms), placed from the chosen
 *  tab's box and placed again when the choice, the tabs or the list's size
 *  change. A vertical list draws none: its rows bring their own look. */
function TabsBar() {
  const bar = React.useRef<HTMLSpanElement>(null)
  const [place, setPlace] = React.useState<{ left: number; width: number } | null>(null)
  React.useLayoutEffect(() => {
    const list = bar.current?.parentElement
    if (!list) return
    const measure = () => {
      const tab = list.querySelector<HTMLElement>('[data-slot="tabs-trigger"][data-state="active"]')
      setPlace((was) => (!tab ? null : was && was.left === tab.offsetLeft && was.width === tab.offsetWidth ? was : { left: tab.offsetLeft, width: tab.offsetWidth }))
    }
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(list)
    const chosen = new MutationObserver(measure)
    chosen.observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] })
    return () => {
      resized.disconnect()
      chosen.disconnect()
    }
  }, [])
  return (
    <span
      ref={bar}
      aria-hidden="true"
      data-slot="tabs-bar"
      hidden={!place}
      className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-foreground transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
      style={place ? { width: place.width, transform: `translateX(${place.left}px)` } : undefined}
    />
  )
}

/** A 28px pill at 13px: muted until chosen, the chosen one on the selected
 *  fill, no weight change. In a `line` list it is bare text the list's
 *  height, the chosen one in ink over the list's bar (`TabsBar`). With
 *  `asChild` the child brings its own look. */
function TabsTrigger({
  className,
  asChild,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      asChild={asChild}
      className={asChild ? className : cn(
        "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-body whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-fill-selected data-[state=active]:text-foreground group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:h-full group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-sm group-data-[variant=line]/tabs-list:px-0 group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

/** Radix makes the panel focusable (tabIndex 0): it shows the ring inset. */
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
