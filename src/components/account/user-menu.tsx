"use client";

import Link from "next/link";
import { LayoutDashboard, LogOut } from "lucide-react";
import { cn } from "cn";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { ACCOUNT_ITEMS } from "@/lib/constants/navigation";
import { signOutUser } from "@/server/actions/auth";

/**
 * The signed-in account control: a round initials avatar that opens a menu with
 * the account it belongs to, a way into the app, and sign out.
 *
 * Initials rather than the provider photo. Google and GitHub both hand us an
 * avatar URL, but rendering it means either configuring remote image patterns
 * for two more hosts or shipping an unoptimised `<img>` — and a monogram never
 * fails to load, never shifts layout, and matches the mark in the header. The
 * photo is a later nicety, not a requirement.
 *
 * `showDashboardLink` is off on the dashboard itself: a menu item that points at
 * the page you are already reading is noise.
 */
function initialsFor(name: string | null, email: string): string {
  const source = name?.trim() || email.trim();
  const words = source.split(/[\s.@_-]+/).filter(Boolean);

  const letters = words
    .slice(0, 2)
    .map((word) => word[0])
    .join("");

  return (letters || source[0] || "?").toUpperCase();
}

export function UserMenu({
  name,
  email,
  showDashboardLink = true,
  className,
}: {
  name: string | null;
  email: string;
  showDashboardLink?: boolean;
  /** For dark chrome, where the default light ring offset draws a pale halo. */
  className?: string;
}) {
  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className={cn(
          "bg-primary text-primary-foreground focus-visible:ring-ring/40 focus-visible:ring-offset-background font-heading flex size-9 shrink-0 cursor-default items-center justify-center rounded-full text-xs font-semibold shadow-xs transition-[background-color,box-shadow] duration-150 outline-none hover:bg-[color-mix(in_oklch,var(--primary),black_12%)] focus-visible:ring-3 focus-visible:ring-offset-2 aria-expanded:bg-[color-mix(in_oklch,var(--primary),black_12%)]",
          className,
        )}
      >
        <span aria-hidden="true">{initialsFor(name, email)}</span>
      </MenuTrigger>

      <MenuContent>
        <div className="px-2.5 py-2">
          {name ? <p className="truncate text-sm font-medium">{name}</p> : null}
          <p className="text-muted-foreground truncate text-xs">{email}</p>
        </div>

        <MenuSeparator />

        {showDashboardLink ? (
          <MenuLinkItem render={<Link href="/dashboard" />}>
            <LayoutDashboard aria-hidden="true" />
            Dashboard
          </MenuLinkItem>
        ) : null}

        {/*
         * Profile and settings live here rather than in the sidebar: they are
         * about the account, not about the work, and mixing them into the
         * product's navigation is what turns a focused eight-item sidebar into
         * a list nobody scans. They come from the same navigation module the
         * sidebar reads, so the hrefs cannot drift apart.
         */}
        {ACCOUNT_ITEMS.map((item) => (
          <MenuLinkItem key={item.href} render={<Link href={item.href} />}>
            <item.icon aria-hidden="true" />
            {item.label}
          </MenuLinkItem>
        ))}

        <MenuSeparator />

        {/*
         * A form, not an onClick: sign-out is a Server Action, and this keeps
         * the one path the rest of the app already uses for it.
         *
         * `closeOnClick={false}` is load-bearing. A menu item normally dismisses
         * the popup as it is clicked, which would unmount this form in the same
         * tick — and a detached form never gets to run the browser's default
         * submit, so the click would do nothing at all. Leaving it mounted costs
         * nothing visually: signing out redirects to the landing page, which
         * tears the menu down anyway.
         */}
        <form action={signOutUser}>
          <MenuItem variant="destructive" closeOnClick={false} render={<button type="submit" />}>
            <LogOut aria-hidden="true" />
            Sign out
          </MenuItem>
        </form>
      </MenuContent>
    </Menu>
  );
}
