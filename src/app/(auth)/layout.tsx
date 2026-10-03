import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { InsightVisual } from "@/components/marketing/insight-visual";
import { getCurrentUser } from "@/server/require-user";

/**
 * The shell for /login and /register (DESIGN.md §5).
 *
 * It also guards in the opposite direction to the (app) layout: someone who is
 * already signed in has no use for a sign-in form, and leaving it reachable
 * means a stale open tab can start a second sign-in over a live session.
 *
 * Two columns from `lg` up. The form keeps the full width of a phone to itself,
 * and the panel beside it says what the product is — a sign-in page reached
 * straight from a shared link is otherwise the one screen with no context at
 * all. The panel is `hidden` rather than stacked below on small screens: an
 * argument placed under the form is an argument nobody reads.
 */
const POINTS = [
  "Every application, interview and deadline in one pipeline.",
  "Reminders 24 hours before anything is due.",
  "Response, interview and offer rates you can act on.",
] as const;

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1">
      <div className="flex flex-1 flex-col px-6 py-8 sm:px-10 lg:px-14">
        <Link
          href="/"
          aria-label="CareerTrack home"
          className="focus-visible:ring-ring/40 focus-visible:ring-offset-background self-start rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-offset-2"
        >
          <Logo size="sm" />
        </Link>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-sm">{children}</div>
        </div>
      </div>

      {/*
       * A slate panel rather than another white one: the form already sits on a
       * white card, and the illustration needs a surface to lift off.
       */}
      <aside className="bg-muted/40 border-border relative hidden w-[46%] max-w-2xl flex-col justify-center overflow-hidden border-l px-12 py-12 lg:flex xl:px-16">
        <div className="surface-dotted absolute inset-0 [mask-image:radial-gradient(80%_60%_at_80%_10%,black,transparent)] opacity-60 dark:opacity-[0.07]" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_90%_0%,rgb(10_102_194_/_0.10),transparent_70%)]" />

        <div className="relative flex w-full max-w-md flex-col gap-9">
          <div>
            <p className="eyebrow">CareerTrack</p>

            <h2 className="font-heading mt-3 text-[1.75rem] leading-tight font-semibold text-balance">
              Your job hunt, finally in one place.
            </h2>
          </div>

          <InsightVisual />

          <ul className="flex flex-col gap-4">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <CircleCheck className="text-primary mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
                <span className="text-muted-foreground text-sm leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </main>
  );
}
