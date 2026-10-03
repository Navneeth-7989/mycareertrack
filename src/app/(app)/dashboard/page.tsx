import type { Metadata } from "next";
import { Inbox } from "lucide-react";

import { UserMenu } from "@/components/account/user-menu";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Dashboard · CareerTrack",
};

/**
 * PLACEHOLDER — the real dashboard (live stat tiles, action lists, the sidebar
 * and topbar around it) belongs to the shell step of Phase 1 and is replaced
 * wholesale then. The temporary header here is why the logo and sign-out button
 * are in the page rather than in a layout.
 *
 * It exists now because the auth work needs somewhere to land: a sign-in has to
 * redirect to a page that exists, and "reachable only when authenticated" is
 * only demonstrable if there is something behind the guard. It is styled to the
 * design standard anyway, so the placeholder is not the one screen that looks
 * unfinished.
 *
 * `requireUser()` is called here as well as in the layout on purpose — it is
 * how a page gets the user, and the second call is served from the same
 * request's cache rather than hitting the database twice.
 *
 * The tiles read "—" rather than "0": there is no applications table to count
 * yet, and a zero would be a claim about the user's data instead of the truth,
 * which is that nothing is wired up behind them.
 */
const TILES = ["Applications", "Response rate", "Interviews", "Offers"] as const;

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name?.trim().split(/\s+/)[0];

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-card border-b">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-6">
          <Logo size="sm" />

          {/* No Dashboard link in the menu — this is the dashboard. */}
          <UserMenu name={user.name} email={user.email} showDashboardLink={false} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:py-12">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Here is where your pipeline will live.
          </p>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TILES.map((label) => (
            <Card key={label} size="sm" className="gap-1">
              <CardContent>
                <dt className="text-muted-foreground text-xs font-medium tracking-[0.08em] uppercase">
                  {label}
                </dt>
                <dd className="font-heading text-muted-foreground mt-2 text-3xl font-semibold tabular-nums">
                  —
                </dd>
              </CardContent>
            </Card>
          ))}
        </dl>

        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="bg-accent text-primary flex size-11 items-center justify-center rounded-xl">
              <Inbox className="size-5" aria-hidden="true" />
            </span>

            <div className="max-w-sm">
              <p className="font-heading text-base font-semibold tracking-tight">
                No applications yet
              </p>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                Adding and tracking applications is the next block of the build. Your profile is
                saved, so there is nothing you need to do here right now.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6" size="sm">
          <CardHeader>
            <CardTitle>Your account</CardTitle>
            <CardDescription>Collected during setup, editable later from settings.</CardDescription>
          </CardHeader>

          <CardContent>
            <dl className="divide-border grid divide-y text-sm">
              {[
                { label: "Email", value: user.email },
                { label: "Name", value: user.name ?? "—" },
                { label: "Timezone", value: user.timezone },
                { label: "Default view", value: user.defaultView.toLowerCase() },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="truncate font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
