"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { PencilLine, Plus } from "lucide-react";

import { EnumSelect, enumOptions } from "@/components/form/enum-select";
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
  EVENT_TYPE_LABELS,
  MANUAL_EVENT_TITLE_PLACEHOLDERS,
  MANUAL_EVENT_TYPES,
  MANUAL_EVENT_TYPE_HINTS,
  type ManualEventTypeValue,
} from "@/lib/constants/event";
import { todayAsDateOnly } from "@/lib/utils/date-only";
import {
  emptyEventForm,
  eventSchema,
  toEventFormValues,
  type EventFormValues,
  type EventPayload,
} from "@/lib/validations/event";

/**
 * Add or edit a manual timeline entry.
 *
 * One component for both, on the same reasoning as `ApplicationForm`: they are
 * the same four fields with the same validation, and the only differences are
 * where it posts and what it starts from. A second copy would be a second place
 * for the future-date rule and the type picker to drift.
 *
 * Passing `event` is what makes it an edit — one optional prop rather than a
 * `mode` flag plus three fields that only mean anything when it is set, which the
 * compiler cannot police.
 *
 * It posts **raw form values**, `getValues()` rather than the payload
 * `handleSubmit` produces. `eventSchema`'s input side is all strings and the API
 * re-validates with that same schema, so sending the parsed version would post a
 * `Date` where "2026-03-14" is expected and have the server reject its own
 * output. The same contract the onboarding wizard learned the hard way;
 * `tests/lib/event-validations.test.ts` keeps a tripwire on it.
 */

/**
 * Only the seven manual types are offered, with a hint under each. The three
 * automatic ones are not in this list and are not accepted by the endpoint
 * either — `constants/event` has the reasoning, which comes down to the event log
 * being the authority §3 computes interview and offer rates from.
 */
const TYPE_OPTIONS = enumOptions(
  MANUAL_EVENT_TYPES,
  // A subset of the full label map, which is the one place the two lists meet.
  EVENT_TYPE_LABELS,
  MANUAL_EVENT_TYPE_HINTS,
);

export type EventToEdit = {
  id: string;
  type: ManualEventTypeValue;
  title: string;
  description: string | null;
  occurredAt: Date;
};

export function EventDialog({
  applicationId,
  event,
}: {
  applicationId: string;
  /** Present for an edit, absent for an add. */
  event?: EventToEdit;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = event !== undefined;

  /*
   * Ids have to be unique per instance: the detail page renders one of these per
   * manual entry plus the one in the card header, so a hard-coded `id="title"`
   * would have every `<label for>` on the page point at the first dialog's input.
   */
  const fieldId = useId();

  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues, unknown, EventPayload>({
    resolver: zodResolver(eventSchema),
    mode: "onTouched",
    defaultValues: event ? toEventFormValues(event) : emptyEventForm(),
  });

  const type = (useWatch({ control, name: "type" }) ?? "CUSTOM") as ManualEventTypeValue;

  /**
   * Re-seeds the form whenever the dialog opens.
   *
   * In the opening handler rather than an effect, which the React Compiler's
   * `react-hooks/set-state-in-effect` rule requires and which is the better place
   * anyway — an effect would re-run on renders that have nothing to do with the
   * dialog being opened.
   *
   * It matters in both modes. An abandoned edit would otherwise re-open showing
   * the half-typed changes the user walked away from, as though they had been
   * saved; and the add form's default date is *today*, which goes stale on a page
   * left open overnight.
   */
  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      reset(event ? toEventFormValues(event) : emptyEventForm());
    }

    setOpen(next);
  }

  async function save() {
    setFormError(null);

    try {
      const response = await fetch(
        isEdit ? `/api/events/${event.id}` : `/api/applications/${applicationId}/events`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Raw values, not the parsed payload — see the note above.
          body: JSON.stringify(getValues()),
        },
      );

      if (!response.ok) {
        const { message, fields } = await readApiError(
          response,
          isEdit ? "Could not save that entry." : "Could not add that entry.",
        );

        /*
         * Field errors go on their fields; anything else goes to the banner.
         * `isFieldName` guards the cast, because a server that grew a field this
         * form does not render would otherwise call `setError` on a name React
         * Hook Form has never heard of, and the message would vanish silently.
         */
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

      toast.add({
        type: "success",
        title: isEdit ? "Entry updated" : "Entry added",
        description: getValues("title"),
      });

      /*
       * `refresh()`, not a local update. The timeline is rendered by a Server
       * Component, and an `EMAIL_RECEIVED` entry can also move
       * `firstResponseAt` — which the stats strip above the timeline reads. Both
       * come from the server, so re-rendering from it is the only way the page
       * stays consistent with what was written.
       */
      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  // The parsed payload is ignored on purpose: this submits raw values, and the
  // resolver's job here is validation, not transport.
  const onSubmit = handleSubmit(() => save());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {isEdit ? (
        <Button variant="ghost" size="icon-sm" render={<DialogTrigger />}>
          <PencilLine aria-hidden="true" />
          {/* Names the entry, so a screen reader hears which of several Edit
              buttons this is rather than "Edit, button" seven times. */}
          <span className="sr-only">Edit “{event.title}”</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" render={<DialogTrigger />}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          Add entry
        </Button>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit timeline entry" : "Add a timeline entry"}</DialogTitle>

          <DialogDescription>
            {isEdit
              ? "Only entries you wrote can be changed. Status moves are recorded automatically."
              : "Record something that happened — a reply, an assessment link, a follow-up you sent."}
          </DialogDescription>
        </DialogHeader>

        {/*
         * `noValidate`, as everywhere else in the app: the browser's own bubbles
         * would appear beside the Zod messages and say something different.
         */}
        <form onSubmit={onSubmit} noValidate className="mt-6">
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.type}>
                <FieldLabel htmlFor={`${fieldId}-type`}>Kind</FieldLabel>

                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <EnumSelect
                      id={`${fieldId}-type`}
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={TYPE_OPTIONS}
                      invalid={!!errors.type}
                      describedBy={errors.type ? `${fieldId}-type-error` : undefined}
                      disabled={isSubmitting}
                    />
                  )}
                />

                <FieldError id={`${fieldId}-type-error`} errors={[errors.type]} />
              </Field>

              <Field data-invalid={!!errors.occurredAt}>
                <FieldLabel htmlFor={`${fieldId}-occurredAt`}>Date</FieldLabel>

                <Input
                  id={`${fieldId}-occurredAt`}
                  type="date"
                  /*
                   * Capped at today, because the schema rejects the future: a
                   * timeline records what happened, and a reminder is a task or
                   * an interview. The picker refusing to offer next week is
                   * kinder than a validation message after the fact.
                   */
                  max={todayAsDateOnly()}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.occurredAt || undefined}
                  aria-describedby={
                    errors.occurredAt ? `${fieldId}-occurredAt-error` : `${fieldId}-occurredAt-hint`
                  }
                  {...register("occurredAt")}
                />

                {errors.occurredAt ? (
                  <FieldError id={`${fieldId}-occurredAt-error`} errors={[errors.occurredAt]} />
                ) : (
                  <FieldDescription id={`${fieldId}-occurredAt-hint`}>
                    When it happened, not when you logged it.
                  </FieldDescription>
                )}
              </Field>
            </div>

            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor={`${fieldId}-title`}>Title</FieldLabel>

              <Input
                id={`${fieldId}-title`}
                // Moves with the chosen kind, so the example is always one that
                // fits what the user just picked.
                placeholder={MANUAL_EVENT_TITLE_PLACEHOLDERS[type]}
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={!!errors.title || undefined}
                aria-describedby={errors.title ? `${fieldId}-title-error` : undefined}
                {...register("title")}
              />

              <FieldError id={`${fieldId}-title-error`} errors={[errors.title]} />
            </Field>

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor={`${fieldId}-description`}>Details</FieldLabel>

              <Textarea
                id={`${fieldId}-description`}
                rows={3}
                placeholder="Optional — anything worth remembering about it"
                disabled={isSubmitting}
                aria-invalid={!!errors.description || undefined}
                aria-describedby={errors.description ? `${fieldId}-description-error` : undefined}
                {...register("description")}
              />

              <FieldError id={`${fieldId}-description-error`} errors={[errors.description]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isSubmitting}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof EventFormValues;

const FIELD_NAMES = Object.keys(emptyEventForm()) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}
