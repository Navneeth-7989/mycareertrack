"use client";

import { useEffect, useRef } from "react";

import { toast } from "@/components/ui/toast";

/**
 * The confirmation that the onboarding wizard actually saved something.
 *
 * The wizard finishes with a hard navigation to `/dashboard?welcome=1` (see the
 * comment on that line in `onboarding-wizard.tsx`), which means the page it
 * lands on has no React state carrying "you just signed up" — the query
 * parameter is the handoff.
 *
 * Two details keep it from misbehaving:
 *
 * - `fired` guards against React's development double-invoke of effects, which
 *   would otherwise queue the toast twice on every first load.
 * - `replaceState` strips the parameter immediately. Without it, a reload or a
 *   shared URL replays the welcome, and the history entry keeps a parameter
 *   that no longer means anything. It is used rather than `router.replace()`
 *   deliberately: this changes nothing the server rendered, so re-running the
 *   route to drop one parameter would be a wasted request.
 */
export function WelcomeToast({ firstName }: { firstName?: string | undefined }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) {
      return;
    }

    fired.current = true;

    toast.add({
      type: "success",
      title: firstName ? `You're all set, ${firstName}` : "You're all set",
      description: "Your profile is saved. This is where your pipeline will live.",
    });

    const url = new URL(window.location.href);
    url.searchParams.delete("welcome");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [firstName]);

  return null;
}
