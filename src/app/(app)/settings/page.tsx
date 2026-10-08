import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SettingsForm } from "@/components/settings/settings-form";
import { toSettingsFormValues } from "@/lib/validations/settings";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Settings · CareerTrack",
};

/**
 * Account settings — the reminder toggles §7 asks for, plus the two account
 * preferences the placeholder page had been promising since Phase 1.
 *
 * **No query of its own.** All seven columns are already on `CurrentUser`:
 * notification generation needs the five preference fields on the render path
 * of every page, so they joined `currentUserSelect` rather than being read
 * twice — and `requireUser()` is memoised per request, so this page's call is
 * served from the same row the layout read.
 *
 * The form is the only client component. Everything above it, including the
 * values it starts from, is server-rendered.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="What you get reminded about, and how the app opens. Reminders arrive in the notification inbox only — this build sends no email."
      />

      <div className="max-w-2xl">
        <SettingsForm settings={toSettingsFormValues(user)} />
      </div>
    </div>
  );
}
