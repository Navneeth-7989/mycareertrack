"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { PencilLine, UserPlus } from "lucide-react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { readApiError } from "@/lib/api/read-error";
import {
  EMPTY_CONTACT_FORM,
  contactFormSchema,
  toContactFormValues,
  type ContactFormPayload,
  type ContactFormSource,
  type ContactFormValues,
} from "@/lib/validations/contact";

/**
 * Add or edit a contact.
 *
 * **The only dialog in Phase 3 that can be interrupted by a question.** A name that
 * matches an existing contact returns 409 `CONFIRMATION_REQUIRED` with nothing written,
 * and the alert dialog at the bottom asks before the same request is re-sent with
 * `acknowledgeDuplicate: true` — the identical arrangement to the application form's
 * duplicate confirmation, including the fact that confirming is a *second request*
 * rather than a resumed one, so an abandoned question leaves nothing behind to expire.
 *
 * A duplicate **email** is different: it comes back as a plain 409 on the email field
 * and cannot be confirmed away, because `[userId, email]` is unique (§3). See
 * `mutations/contacts` for why §8's single "warning" splits in two.
 *
 * On edit, `sharedWith` warns how many applications read this record before the user
 * changes it — the same courtesy the application form's recruiter block pays, and for
 * the same reason: this edit overwrites, and a shared contact changes for all of them.
 */

export type ContactToEdit = ContactFormSource & {
  id: string;
  /** How many applications this contact is linked to. */
  linkCount: number;
};

export function ContactDialog({
  contact,
  trigger = "button",
}: {
  contact?: ContactToEdit;
  trigger?: "button" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** The duplicate question, or null. Held because it is the server's sentence. */
  const [duplicateQuestion, setDuplicateQuestion] = useState<string | null>(null);

  /**
   * The confirm path runs outside `handleSubmit`, so `isSubmitting` is false while it
   * is in flight and the save button would look idle. This covers it.
   */
  const [isConfirming, setIsConfirming] = useState(false);

  const isEdit = contact !== undefined;
  const fieldId = useId();

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues, unknown, ContactFormPayload>({
    resolver: zodResolver(contactFormSchema),
    mode: "onTouched",
    defaultValues: contact ? toContactFormValues(contact) : EMPTY_CONTACT_FORM,
  });

  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      setDuplicateQuestion(null);
      reset(contact ? toContactFormValues(contact) : EMPTY_CONTACT_FORM);
    }

    setOpen(next);
  }

  /**
   * Posts the form. `acknowledgeDuplicate` is false on the first attempt and true only
   * once the user has answered.
   *
   * One function called from two places, so the retry is the *same* request with one
   * field flipped rather than a second code path that could drift.
   */
  async function save(acknowledgeDuplicate: boolean) {
    setFormError(null);

    try {
      const response = await fetch(isEdit ? `/api/contacts/${contact.id}` : "/api/contacts", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // Raw values plus the flag — the flag is not a form field, so it is appended
        // here rather than held in state.
        body: JSON.stringify({ ...getValues(), acknowledgeDuplicate }),
      });

      if (!response.ok) {
        const { code, message, fields, confirmation } = await readApiError(
          response,
          isEdit ? "Could not save that contact." : "Could not add that contact.",
        );

        if (code === "CONFIRMATION_REQUIRED" && confirmation) {
          setDuplicateQuestion(confirmation.message);

          return;
        }

        let placed = false;

        for (const [name, error] of Object.entries(fields)) {
          if (isFieldName(name)) {
            setError(name, { message: error });
            placed = true;
          }
        }

        if (!placed) {
          setFormError(message);
        }

        return;
      }

      setOpen(false);
      setDuplicateQuestion(null);

      toast.add({
        type: "success",
        title: isEdit ? "Contact updated" : "Contact added",
        description: getValues("name"),
      });

      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  const onSubmit = handleSubmit(() => save(false));

  async function confirmDuplicate() {
    setDuplicateQuestion(null);
    setIsConfirming(true);

    try {
      await save(true);
    } finally {
      setIsConfirming(false);
    }
  }

  const busy = isSubmitting || isConfirming;

  /** Applications other than the one in context that read this record. */
  const sharedWith = contact ? contact.linkCount : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger === "icon" ? (
        <Button variant="ghost" size="icon-sm" render={<DialogTrigger />}>
          <PencilLine aria-hidden="true" />
          <span className="sr-only">Edit {contact?.name ?? "contact"}</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" render={<DialogTrigger />}>
          <UserPlus aria-hidden="true" data-icon="inline-start" />
          Add contact
        </Button>
      )}

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit contact" : "Add a contact"}</DialogTitle>

          <DialogDescription>
            A recruiter, a referrer, a hiring manager. Only the name is required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="mt-6">
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {/*
           * Said before the fields, not after. The point is to inform the edit, and a
           * warning under the save button is a warning about something already decided.
           */}
          {isEdit && sharedWith > 1 ? (
            <Alert className="mb-5">
              <AlertDescription>
                This contact is linked to {sharedWith} applications. Changes here apply to all of
                them.
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`${fieldId}-name`}>Name</FieldLabel>

                <Input
                  id={`${fieldId}-name`}
                  placeholder="Priya Sharma"
                  autoComplete="off"
                  autoFocus
                  disabled={busy}
                  aria-invalid={!!errors.name || undefined}
                  {...register("name")}
                />

                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.role}>
                <FieldLabel htmlFor={`${fieldId}-role`}>Role</FieldLabel>

                <Input
                  id={`${fieldId}-role`}
                  placeholder="Technical recruiter"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.role || undefined}
                  {...register("role")}
                />

                <FieldDescription>Their job, not their role on one application.</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor={`${fieldId}-email`}>Email</FieldLabel>

                <Input
                  id={`${fieldId}-email`}
                  type="email"
                  placeholder="priya@company.com"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.email || undefined}
                  {...register("email")}
                />

                <FieldError errors={[errors.email]} />
              </Field>

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor={`${fieldId}-phone`}>Phone</FieldLabel>

                <Input
                  id={`${fieldId}-phone`}
                  type="tel"
                  placeholder="+91 98765 43210"
                  autoComplete="off"
                  disabled={busy}
                  aria-invalid={!!errors.phone || undefined}
                  {...register("phone")}
                />

                <FieldError errors={[errors.phone]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.linkedinUrl}>
              <FieldLabel htmlFor={`${fieldId}-linkedinUrl`}>LinkedIn</FieldLabel>

              <Input
                id={`${fieldId}-linkedinUrl`}
                type="url"
                placeholder="linkedin.com/in/priya"
                autoComplete="off"
                disabled={busy}
                aria-invalid={!!errors.linkedinUrl || undefined}
                {...register("linkedinUrl")}
              />

              <FieldError errors={[errors.linkedinUrl]} />
            </Field>

            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor={`${fieldId}-notes`}>Notes</FieldLabel>

              <Textarea
                id={`${fieldId}-notes`}
                rows={3}
                placeholder="How you met, what they said, anything useful next time"
                disabled={busy}
                aria-invalid={!!errors.notes || undefined}
                {...register("notes")}
              />

              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={busy}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save changes" : "Add contact"}
            </Button>
          </DialogFooter>
        </form>

        {/*
         * Nested inside the form dialog, which Base UI handles: the alert dialog takes
         * focus and the form underneath stays mounted, so answering "add anyway"
         * re-posts the values the user already typed.
         */}
        <AlertDialog
          open={duplicateQuestion !== null}
          onOpenChange={(next) => {
            if (!next) {
              setDuplicateQuestion(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Looks like someone you already have</AlertDialogTitle>
              <AlertDialogDescription>{duplicateQuestion}</AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <Button variant="outline" size="lg" render={<AlertDialogClose />}>
                Go back
              </Button>

              <Button size="lg" onClick={() => void confirmDuplicate()}>
                Add anyway
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof ContactFormValues;

const FIELD_NAMES = Object.keys(EMPTY_CONTACT_FORM) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}
