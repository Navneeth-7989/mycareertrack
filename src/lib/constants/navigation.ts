import {
  Bell,
  Briefcase,
  CalendarClock,
  ChartColumnBig,
  ClipboardList,
  FileText,
  LayoutDashboard,
  ListTodo,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for the app's navigation (DESIGN.md §5).
 *
 * The sidebar, the mobile drawer and the topbar's section label all read this
 * list. That matters more than it looks: three hand-maintained copies of the
 * same eight links is how a sidebar ends up disagreeing with the page you are
 * actually on, and the active-state match depends on the hrefs being identical
 * everywhere.
 *
 * Notifications are deliberately absent from the sections below — they live in
 * the topbar as a bell, because an inbox is something you check rather than a
 * place you work. Profile and settings are absent for the same reason: they
 * belong to the account menu, not to the product's navigation.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavSection = {
  /** Null for the first group, which needs no label to be understood. */
  label: string | null;
  items: NavItem[];
};

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/applications", label: "Applications", icon: Briefcase },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/interviews", label: "Interviews", icon: CalendarClock },
      { href: "/assessments", label: "Assessments", icon: ClipboardList },
      { href: "/tasks", label: "Tasks", icon: ListTodo },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/resumes", label: "Resumes", icon: FileText },
    ],
  },
  {
    label: "Insights",
    items: [{ href: "/analytics", label: "Analytics", icon: ChartColumnBig }],
  },
] as const;

/** The destinations that are reachable but not in the sidebar. */
export const NOTIFICATIONS_ITEM: NavItem = {
  href: "/notifications",
  label: "Notifications",
  icon: Bell,
};

export const ACCOUNT_ITEMS: readonly NavItem[] = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const EVERY_ITEM: readonly NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  NOTIFICATIONS_ITEM,
  ...ACCOUNT_ITEMS,
];

/**
 * Whether a nav item should read as current for the given pathname.
 *
 * Prefix matching, not equality, so that `/applications/abc123/edit` keeps
 * "Applications" lit — a detail page is still inside its section, and a
 * sidebar that goes blank when you open a row is a navigation bug. The
 * boundary check on the next character is what stops `/assessments` from
 * matching a hypothetical `/assessments-archive`.
 */
export function isNavItemActive(itemHref: string, pathname: string): boolean {
  return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
}

/**
 * The label for the current route, used by the topbar as sticky context once
 * the page's own heading has scrolled away. Longest href wins, so a future
 * nested entry beats its parent section.
 */
export function navLabelForPathname(pathname: string): string | null {
  const match = EVERY_ITEM.filter((item) => isNavItemActive(item.href, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];

  return match?.label ?? null;
}
