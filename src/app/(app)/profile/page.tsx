import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Profile · CareerTrack",
};

/**
 * The account basics, read straight off the session user.
 *
 * This page shows real data rather than a "coming later" placeholder because
 * every field on it is already on `CurrentUser` — the layout has loaded them to
 * run its own guard, so displaying them costs nothing extra (`requireUser()` is
 * request-cached).
 *
 * The university, degree, graduation year and links the wizard collected live
 * on `Profile`, a separate table. Reading them needs a query that belongs in
 * `server/queries/` alongside the editing form, so they arrive together rather
 * than as a read-only tease here.
 */
export default async function ProfilePage() {
  const user = await requireUser();

  const rows = [
    { label: "Name", value: user.name?.trim() || "—" },
    { label: "Email", value: user.email },
    { label: "Timezone", value: user.timezone },
    { label: "Default view", value: user.defaultView === "KANBAN" ? "Board" : "Table" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Profile"
        description="Collected when you set up your account. Editing arrives with the settings work."
      />

      <Card className="max-w-2xl" size="sm">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Your email comes from the way you signed in and cannot be changed here.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <dl className="divide-border grid divide-y text-sm">
            {rows.map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 truncate font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
