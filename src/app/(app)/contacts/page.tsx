import type { Metadata } from "next";
import { Users } from "lucide-react";

import { ContactCard } from "@/components/contacts/contact-card";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CONTACT_LIMIT, listContacts } from "@/server/queries/contacts";
import { requireUser } from "@/server/require-user";

export const metadata: Metadata = {
  title: "Contacts · CareerTrack",
};

/**
 * `/contacts` — everyone you have spoken to, and which applications they touch.
 *
 * Replaces the `PlannedPage` placeholder wholesale. The page is the Phase 3 half of
 * this feature: auto-creation from the application form shipped in Phase 2 (§9), so an
 * account that has logged applications with recruiter details already has rows here the
 * moment this page exists.
 *
 * **Most-connected first**, not alphabetical — see `listContacts`. The recruiter who
 * has handled four of your applications is the one you came here to find.
 */
export default async function ContactsPage() {
  const user = await requireUser();
  const contacts = await listContacts(user.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Contacts"
        description="Recruiters, referrers and hiring managers, with the applications each one is attached to."
        actions={<ContactDialog />}
      />

      {contacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description="Add a recruiter or a referrer here, or type their email into an application's recruiter fields and one will be created for you."
          action={<ContactDialog />}
        />
      ) : (
        <>
          {/*
           * `items-stretch` with `h-full` on the card is what makes a row of cards share
           * a height, so the application lists pinned to their bottoms line up.
           */}
          <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {contacts.map((contact) => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>

          {contacts.length >= CONTACT_LIMIT ? (
            <p className="text-muted-foreground text-xs">
              Showing the first {CONTACT_LIMIT} contacts.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
