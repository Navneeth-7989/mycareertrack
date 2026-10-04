"use client";

import { usePathname } from "next/navigation";
import { cn } from "cn";

import { navLabelForPathname } from "@/lib/constants/navigation";

/**
 * The current section's name, shown in the topbar on desktop.
 *
 * This is not a duplicate of the page's `<h1>`, and the type scale is what says
 * so: 13px medium here against a 24px semibold heading in the content. The
 * topbar is sticky and the heading is not, so once a long list has scrolled
 * this is the only thing left on screen that says where you are.
 *
 * It renders a `<p>` rather than a heading element on purpose — a second
 * heading announcing the same thing as the page title would be noise in a
 * screen reader's outline.
 */
export function SectionLabel({ className }: { className?: string }) {
  const label = navLabelForPathname(usePathname());

  if (!label) {
    return null;
  }

  return <p className={cn("text-[0.8125rem] font-medium", className)}>{label}</p>;
}
