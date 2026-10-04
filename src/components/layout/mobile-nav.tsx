"use client";

import { useState } from "react";
import Link from "next/link";
import { Drawer } from "@base-ui/react/drawer";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

import { SidebarNav } from "./sidebar-nav";

/**
 * Navigation below `lg`, where the fixed sidebar is hidden.
 *
 * A drawer rather than a dropdown menu: eight destinations in a popup anchored
 * to a 32px button is a scrolling list that covers the page it is navigating
 * away from. A sheet also gets swipe-to-dismiss for free, which is the gesture
 * people actually use on a phone.
 *
 * Controlled open state, because the drawer has to close itself when a link is
 * tapped — see the note on `onNavigate` in `sidebar-nav.tsx`. Base UI handles
 * the rest of the hard parts: focus is trapped while open, page scroll is
 * locked, Escape and the backdrop dismiss, and focus returns to the trigger.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="left">
      <Drawer.Trigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Open navigation" />}
        className="lg:hidden"
      >
        <Menu aria-hidden="true" />
      </Drawer.Trigger>

      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-[oklch(0.208_0.042_265.755)]/35 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-350 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0" />

        <Drawer.Viewport className="fixed inset-0 z-40 flex items-stretch justify-start">
          <Drawer.Popup className="bg-sidebar border-sidebar-border flex h-full w-72 max-w-[calc(100vw-3rem)] [transform:translateX(var(--drawer-swipe-movement-x))] flex-col border-r shadow-xl transition-transform duration-350 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none data-ending-style:[transform:translateX(-100%)] data-starting-style:[transform:translateX(-100%)] data-swiping:select-none motion-reduce:transition-none">
            {/*
             * The accessible name for the sheet. The wordmark next to it is the
             * visible equivalent, but it is a link to the dashboard rather than
             * a heading, so it cannot serve as the dialog's label.
             */}
            <Drawer.Title className="sr-only">Navigation</Drawer.Title>

            <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-4">
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                aria-label="CareerTrack dashboard"
                className="focus-visible:ring-ring/40 rounded-lg outline-none focus-visible:ring-3"
              >
                <Logo size="sm" />
              </Link>

              <Drawer.Close
                render={<Button variant="ghost" size="icon-sm" aria-label="Close navigation" />}
              >
                <X aria-hidden="true" />
              </Drawer.Close>
            </div>

            <nav
              aria-label="Main"
              className="flex-1 overflow-y-auto overscroll-contain px-3 pt-2 pb-6"
            >
              <SidebarNav onNavigate={() => setOpen(false)} />
            </nav>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
