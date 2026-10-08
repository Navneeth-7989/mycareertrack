"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

import { EnumSelect } from "@/components/form/enum-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import type { ContactOption } from "@/server/queries/contacts";

/**
 * Attaches an existing contact to this application — the many-to-many §7 asks for.
 *
 * Deliberately *only* links; it cannot create a person. Creating one here would
 * duplicate the contacts page's form and bypass its duplicate checks, so an application
 * with nobody to link sends the user there instead.
 *
 * No React Hook Form: two fields, one of them a select, and nothing to validate beyond
 * "something is chosen". Reaching for the resolver machinery here would be more
 * ceremony than the form has content.
 */
export function LinkContactDialog({
  applicationId,
  options,
}: {
  applicationId: string;
  /** Contacts not already linked to this application — see `listLinkableContacts`. */
  options: ContactOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState(options[0]?.id ?? "");
  const [role, setRole] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (next) {
      setContactId(options[0]?.id ?? "");
      setRole("");
      setError(null);
    }

    setOpen(next);
  }

  async function link() {
    if (!contactId) {
      setError("Choose who to link.");

      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/applications/${applicationId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, role }),
      });

      if (!response.ok) {
        const { message } = await readApiError(response, "Could not link that contact.");

        setError(message);
        setIsSaving(false);

        return;
      }

      setOpen(false);
      setIsSaving(false);

      toast.add({ type: "success", title: "Contact linked" });

      router.refresh();
    } catch {
      setError("Check your connection and try again.");
      setIsSaving(false);
    }
  }

  const fieldId = useId();

  const choices = options.map((option) => ({
    value: option.id,
    label: option.name,
    // The email disambiguates two people with the same name, which is exactly the
    // case the contacts page allows through its duplicate confirmation.
    ...(option.email ? { hint: option.email } : option.role ? { hint: option.role } : {}),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button variant="ghost" size="sm" render={<DialogTrigger />} disabled={options.length === 0}>
        <Link2 aria-hidden="true" data-icon="inline-start" />
        Link
      </Button>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link a contact</DialogTitle>
          <DialogDescription>
            Attach someone you have already saved to this application.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          {error ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${fieldId}-contact`}>Contact</FieldLabel>

              <EnumSelect
                id={`${fieldId}-contact`}
                value={contactId}
                onValueChange={(next) => {
                  setContactId(next);
                  setError(null);
                }}
                options={choices}
                disabled={isSaving}
              />

              {!contactId ? <FieldError>Choose who to link.</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor={`${fieldId}-role`}>Role on this application</FieldLabel>

              <Input
                id={`${fieldId}-role`}
                placeholder="HR, hiring manager, referrer…"
                autoComplete="off"
                value={role}
                disabled={isSaving}
                onChange={(event) => setRole(event.target.value)}
              />

              {/*
               * The join's `role`, not the contact's own (§3). Worth spelling out: the
               * contact card shows a job title, and these two fields look identical
               * until you know one is per-application.
               */}
              <FieldDescription>
                Optional. Separate from their job title — the same person can be a referrer here and
                a hiring manager elsewhere.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isSaving}>
              Cancel
            </Button>

            <Button size="lg" onClick={() => void link()} disabled={isSaving}>
              {isSaving ? "Linking…" : "Link contact"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
