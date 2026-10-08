import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { ToastViewport } from "@/components/ui/toast";
import { getNotificationBellCounts } from "@/server/queries/notifications";
import { requireUser } from "@/server/require-user";
import { ensureNotificationsGenerated } from "@/server/services/notifications";

/**
 * The app shell, and the auth and onboarding guard for every page inside it
 * (DESIGN.md §5, §8).
 *
 * The guard is the first of the two layers the design calls for, not the only
 * one: Route Handlers call `requireApiUser()` themselves, because a layout only
 * guards rendering and says nothing about a direct request to /api.
 *
 * The onboarding gate reads the live `onboardingCompleted` value rather than a
 * session claim — `requireUser()` always does — so finishing the wizard lets a
 * user through on the very next request, with no token to refresh.
 *
 * Structure: a fixed sidebar below `lg`-hidden, and a content column offset by
 * its width. `lg:pl-64` is the one place the 256px in `Sidebar` is mirrored, so
 * if that width ever changes these two lines change together.
 *
 * The toast viewport wraps the whole shell rather than sitting inside a page.
 * Mutations in this app navigate — create an application and you land on its
 * detail page — and a viewport mounted per page would unmount the confirmation
 * in the same tick it was queued.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  if (!user.onboardingCompleted) {
    redirect("/onboarding");
  }

  /*
   * Notification generation, and the badge it feeds — DESIGN.md §3's
   * compute-on-read model. This is the "any authenticated page" the design
   * names: there is no cron because the inbox is in-app only, so the work only
   * matters at the moment someone opens the app, which is here.
   *
   * It runs *after* the onboarding gate on purpose. A user still in the wizard
   * has no applications to be reminded about, and paying four reads to confirm
   * that on every step of signup would be the most wasteful place in the app
   * to do it.
   *
   * Sequential, not `Promise.all`: the counts have to be read after generation
   * or the badge would be one page load behind the notifications it is
   * counting. `ensureNotificationsGenerated` swallows its own failures, so a
   * generation problem degrades the badge rather than replacing every page in
   * the app with an error — see its comment.
   */
  await ensureNotificationsGenerated(user);
  const notifications = await getNotificationBellCounts(user.id);

  return (
    <ToastViewport>
      <Sidebar />

      <div className="flex min-h-full flex-1 flex-col lg:pl-64">
        <Topbar name={user.name} email={user.email} notifications={notifications} />

        <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </ToastViewport>
  );
}
