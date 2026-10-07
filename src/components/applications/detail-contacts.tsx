import { AtSign, Link2, Phone, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApplicationDetail } from "@/server/queries/applications";

/**
 * The people attached to this application.
 *
 * Today that means whoever the create form's recruiter fields produced —
 * `resolveAndLinkRecruiter` either matched an existing contact by email or made
 * a new one, so most applications have none and some have exactly one. The
 * contacts *page*, manual linking and the duplicate warning are Phase 3; this
 * only surfaces what the form already saved, which was otherwise invisible.
 *
 * The role shown is the one on the join row, falling back to the contact's own.
 * That order is the point of storing it on the join (§3): the same person can
 * be a referrer on one application and the hiring manager on another, and the
 * per-application answer is the one that belongs on this page.
 *
 * Every channel is a real link. A recruiter's phone number on a phone should
 * dial, and an email address should open a draft — making them selectable text
 * and leaving the user to copy it is the kind of small friction that adds up on
 * the screen someone opens right before a call.
 */
export function DetailContacts({ contacts }: { contacts: ApplicationDetail["contacts"] }) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{contacts.length === 1 ? "Contact" : "Contacts"}</CardTitle>
      </CardHeader>

      <CardContent>
        <ul className="divide-border -my-4 divide-y">
          {contacts.map(({ role, contact }) => (
            <li key={contact.id} className="flex flex-col gap-2.5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{contact.name}</p>

                <ContactRole role={role ?? contact.role} />
              </div>

              <div className="flex flex-col gap-1.5">
                {contact.email ? (
                  <Channel icon={AtSign} href={`mailto:${contact.email}`} label={contact.email} />
                ) : null}

                {contact.phone ? (
                  /*
                   * Spaces stripped from the `tel:` target but not from the
                   * label. "+91 98765 43210" is how a number should be read and
                   * is not a valid tel URI, so the two genuinely differ.
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
