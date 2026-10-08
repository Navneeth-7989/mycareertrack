import Link from "next/link";
// `Link2`, not a LinkedIn brand glyph — this version of lucide ships no brand
// icons. `detail-contacts` already uses the same one for the same field.
import { Link2, Mail, Phone } from "lucide-react";

import { StatusBadge } from "@/components/applications/status-badge";
import { ContactDialog } from "@/components/contacts/contact-dialog";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Card, CardContent } from "@/components/ui/card";
import type { ApplicationStatusValue } from "@/lib/constants/application";

/**
 * One person, as a card.
 *
 * Cards rather than table rows, which is the right call for this data specifically: a
 * contact's useful content is a handful of optional fields plus a variable-length list
 * of the applications they touch. In a table that list has to be truncated to fit a
 * column; in a card it can wrap, which is the whole point of showing it.
 */

export type ContactCardData = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  notes: string | null;
  applications: {
    /** Their role on *this* application, from the join (§3). */
    role: string | null;
    application: {
      id: string;
      jobTitle: string;
      status: ApplicationStatusValue;
      company: { name: string };
    };
  }[];
};

export function ContactCard({ contact }: { contact: ContactCardData }) {
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm leading-snug font-semibold tracking-tight">
              {contact.name}
            </p>

            {contact.role ? (
              <p className="text-muted-foreground mt-0.5 text-[0.8125rem]">{contact.role}</p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <ContactDialog
              contact={{
                id: contact.id,
                name: contact.name,
                role: contact.role,
                email: contact.email,
                phone: contact.phone,
                linkedinUrl: contact.linkedinUrl,
                notes: contact.notes,
                linkCount: contact.applications.length,
              }}
              trigger="icon"
            />

            <ConfirmDelete
              endpoint={`/api/contacts/${contact.id}`}
              triggerLabel={`Delete ${contact.name}`}
              title="Delete this contact?"
              description={
                <>
                  <strong className="text-foreground font-medium">{contact.name}</strong> will be
                  removed
                  {contact.applications.length > 0
                    ? `, along with their link to ${
                        contact.applications.length === 1
                          ? "1 application"
                          : `${contact.applications.length} applications`
                      }. Those applications are not deleted.`
                    : "."}
                </>
              }
              successTitle="Contact deleted"
              successDescription={contact.name}
              failureMessage="Could not delete that contact."
            />
          </div>
        </div>

        {contact.email || contact.phone || contact.linkedinUrl ? (
          <div className="flex flex-col gap-1.5 text-[0.8125rem]">
            {contact.email ? (
              // `mailto:` is the one case where a link to a user-supplied value is the
              // feature. Zod has validated it as an email, so it cannot carry a scheme.
              <a
                href={`mailto:${contact.email}`}
                className="text-muted-foreground hover:text-primary inline-flex min-w-0 items-center gap-2 underline-offset-4 hover:underline"
              >
                <Mail aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </a>
            ) : null}

            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
                className="text-muted-foreground hover:text-primary inline-flex items-center gap-2 underline-offset-4 hover:underline"
              >
                <Phone aria-hidden="true" className="size-3.5 shrink-0" />
                {contact.phone}
              </a>
            ) : null}

            {contact.linkedinUrl ? (
              <a
                href={contact.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary inline-flex min-w-0 items-center gap-2 underline-offset-4 hover:underline"
              >
                <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">LinkedIn</span>
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground text-[0.8125rem]">No contact details</p>
        )}

        {contact.notes ? (
          // `line-clamp-3` rather than the full text: a card in a grid has to keep a
          // predictable height, and the detail lives on the application the note is
          // about. `whitespace-pre-line` would fight the clamp, so it is omitted here.
          <p className="text-muted-foreground line-clamp-3 text-[0.8125rem] leading-relaxed">
            {contact.notes}
          </p>
        ) : null}

        {/* `mt-auto` pins this to the bottom so cards of different heights still line
            their application lists up with each other. */}
        {contact.applications.length > 0 ? (
          <div className="border-border mt-auto border-t pt-3">
            <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-[0.08em] uppercase">
              {contact.applications.length === 1 ? "Application" : "Applications"}
            </p>

            <ul className="mt-2 flex flex-col gap-1.5">
              {contact.applications.map(({ role, application }) => (
                <li key={application.id} className="flex items-center gap-2 text-[0.8125rem]">
                  <Link
                    href={`/applications/${application.id}`}
                    className="hover:text-primary min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                  >
                    {application.jobTitle}
                    <span className="text-muted-foreground"> · {application.company.name}</span>
                    {role ? <span className="text-muted-foreground"> ({role})</span> : null}
                  </Link>

                  <StatusBadge status={application.status} className="h-5 px-2 text-[0.6875rem]" />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground border-border mt-auto border-t pt-3 text-[0.8125rem]">
            Not linked to any application yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
