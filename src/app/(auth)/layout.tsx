import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/server/require-user";

/**
 * The centred, chrome-free shell for /login and /register (DESIGN.md §5).
 *
 * It also guards in the opposite direction to the (app) layout: someone who is
 * already signed in has no use for a sign-in form, and leaving it reachable
 * means a stale open tab can start a second sign-in over a live session.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getCurrentUser()) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
