import { AtSign, Link2, Phone, Unlink, Users, type LucideIcon } from "lucide-react";

import { LinkContactDialog } from "@/components/contacts/link-contact-dialog";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ApplicationDetail } from "@/server/queries/applications";
import type { ContactOption } from "@/server/queries/contacts";

/**
 * The people attached to this application.
 *
 * Phase 2 shipped the read-only version of this card, showing whatever the create
 * form's recruiter fields had produced, and it was hidden when empty — there was no way
 * to add anyone from here, so an empty state would have been a prompt with no button.
 * Step 4 is what changes that: the card now always renders, because it has two working
 * actions.
 *
 * **Linking and unlinking, not creating and deleting.** The `Link` control attaches
 * someone already saved; the unlink control removes the connection and leaves the person
 * alone (§8: contacts are "unlinked, not deleted"). Creating a contact belongs on the
 * contacts page, which is where an application with nobody to link sends the user.
 *
 * The role shown is the one on the join row, falling back to the contact's own. That
 * order is the point of storing it on the join (§3): the same person can be a referrer
 * on one application and the hiring manager on another, and the per-application answer
 * is the one that belongs on this page.
 *
 * Every channel is a real link. A recruiter's phone number on a phone should dial, and
 * an email address should open a draft — making them selectable text and leaving the
 * user to copy it is the kind of small friction that adds up on the screen someone
 * opens right before a call.
 */
export function DetailContacts({
  applicationId,
  contacts,
  linkable,
}: {
  applicationId: string;
  contacts: ApplicationDetail["contacts"];
  /** Contacts not already on this application — the picker's options. */
  linkable: ContactOption[];
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{contacts.length === 1 ? "Contact" : "Contacts"}</CardTitle>

        {contacts.length === 0 ? (
          <CardDescription>Nobody linked to this application yet.</CardDescription>
        ) : null}

        <CardAction>
          <LinkContactDialog applicationId={applicationId} options={linkable} />
        </CardAction>
      </CardHeader>

      <CardContent>
        {contacts.length === 0 ? (
          <div className="flex flex-col gap-3 py-1">
            <div className="text-muted-foreground flex items-center gap-2.5 text-sm">
              <Users aria-hidden="true" className="size-4 shrink-0" />
              {linkable.length > 0
                ? "Link someone you have already saved."
                : "You have no saved contacts yet."}
            </div>

            {/*
             * Shown only when there is nobody to link, which is the case where the
             * Link button above is disabled and would otherwise be a dead end.
             */}
            {linkable.length === 0 ? (
              <ButtonLink href="/contacts" variant="outline" size="sm" className="w-fit">
                Add a contact
              </ButtonLink>
            ) : null}
          </div>
        ) : (
          <ul className="divide-border -my-4 divide-y">
            {contacts.map(({ role, contact }) => (
              <li key={contact.id} className="flex flex-col gap-2.5 py-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{contact.name}</p>

                    <ContactRole role={role ?? contact.role} />
                  </div>

                  <ConfirmDelete
                    endpoint={`/api/applications/${applicationId}/contacts/${contact.id}`}
                    triggerLabel={`Unlink ${contact.name} from this application`}
                    title="Unlink this contact?"
                    description={
                      <>
                        <strong className="text-foreground font-medium">{contact.name}</strong> will
                        no longer be attached to this application.{" "}
                        <strong className="text-foreground font-medium">
                          They are not deleted
                        </strong>{" "}
                        — their details stay on your contacts page, along with any other
                        applications they are linked to.
                      </>
                    }
                    confirmLabel="Unlink"
                    keepLabel="Keep the link"
                    successTitle="Contact unlinked"
                    successDescription={contact.name}
                    failureMessage="Could not unlink that contact."
                    icon={Unlink}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  {contact.email ? (
                    <Channel icon={AtSign} href={`mailto:${contact.email}`} label={contact.email} />
                  ) : null}

                  {contact.phone ? (
                    /*
                     * Spaces stripped from the `tel:` target but not from the label.
                     * "+91 98765 43210" is how a number should be read and is not a
                     * valid tel URI, so the two genuinely differ.
                     */
                    <Channel
                      icon={Phone}
                      href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                      label={contact.phone}
                    />
                  ) : null}

                  {contact.linkedinUrl ? (
                    <Channel
                      icon={Link2}
                      href={contact.linkedinUrl}
                      label="LinkedIn profile"
                      external
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ContactRole({ role }: { role: string | null }) {
  if (!role) {
    return null;
  }

  return <p className="text-muted-foreground truncate text-[0.8125rem]">{role}</p>;
}

function Channel({
  icon: Icon,
  href,
  label,
  external = false,
}: {
  icon: LucideIcon;
  href: string;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      // Only http(s) links get the new tab and the referrer policy. A `mailto:`
      // or `tel:` hands off to the operating system and never opens a window,
      // so `target="_blank"` on one leaves a blank tab behind on some browsers.
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 flex min-w-0 items-center gap-2 rounded-sm text-[0.8125rem] transition-colors focus-visible:ring-3 focus-visible:outline-none"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  );
}
