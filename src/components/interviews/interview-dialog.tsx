"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { CalendarPlus, PencilLine } from "lucide-react";

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
  INTERVIEW_RESULTS,
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  MAX_INTERVIEW_MINUTES,
} from "@/lib/constants/interview";
import {
  emptyInterviewForm,
  interviewFormSchema,
  toInterviewFormValues,
  type InterviewFormSource,
  type InterviewFormValues,
  type InterviewPayload,
} from "@/lib/validations/interview";
import type { ApplicationOption } from "@/server/queries/interviews";

/**
 * Schedule or edit an interview.
 *
 * Three modes, distinguished by which props are passed rather than by a flag:
 *
 * - `interview` → **edit**. The application is not editable in any mode, so no
 *   parent control is rendered and none is posted.
 * - `applicationId` → **create against that application**, which is the detail
 *   page's case: the parent is context the page already has, so asking for it
 *   again would be a control with one possible answer.
 * - `applicationOptions` → **create with a picker**, which is the interviews
 *   page's case: there is no application in context, so it is a field.
 *
 * `timeZone` is `User.timezone`, threaded down from the server. It is what turns
 * the wall clock in the datetime input into an instant, and the API re-derives it
 * from the same column — so the two cannot disagree and a client cannot shift an
 * interview by claiming a different zone. See `utils/date-time`.
 */

const TYPE_OPTIONS = enumOptions(INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS);
const RESULT_OPTIONS = enumOptions(INTERVIEW_RESULTS, INTERVIEW_RESULT_LABELS);

export type InterviewToEdit = InterviewFormSource & { id: string };

export function InterviewDialog({
  timeZone,
  interview,
  applicationId,
  applicationOptions,
}: {
  timeZone: string;
  interview?: InterviewToEdit;
  applicationId?: string;
  applicationOptions?: ApplicationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = interview !== undefined;
  const fieldId = useId();

  /**
   * The application this interview will be attached to, when the user has to
   * choose. Held outside the form because it is not one of the interview's own
   * fields — `interviewFormSchema` deliberately has no `applicationId`, the same
   * arrangement as `acknowledgeDuplicate` on the application form.
   */
  const [chosenApplication, setChosenApplication] = useState(applicationOptions?.[0]?.id ?? "");
  const [applicationError, setApplicationError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
    // Three generics because the schema transforms: the form holds strings while
    // the submit callback would receive a Date and numbers. That callback ignores
    // its argument on purpose — this posts raw values.
  } = useForm<InterviewFormValues, unknown, InterviewPayload>({
    resolver: zodResolver(interviewFormSchema(timeZone)),
    mode: "onTouched",
    defaultValues: interview
      ? toInterviewFormValues(interview, timeZone)
      : emptyInterviewForm(timeZone),
  });

  /**
   * Re-seeds on open, in the handler rather than an effect — the React Compiler's
   * `react-hooks/set-state-in-effect` rule, and the better place anyway.
   *
   * It matters more here than on the timeline dialog: the default `scheduledAt` is
   * *tomorrow at 10:00*, derived from the clock, so a page left open overnight
   * would otherwise offer a date in the past.
   */
  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      setApplicationError(null);
      setChosenApplication(applicationOptions?.[0]?.id ?? "");
      reset(interview ? toInterviewFormValues(interview, timeZone) : emptyInterviewForm(timeZone));
    }

    setOpen(next);
  }

  async function save() {
    setFormError(null);

    // Only reachable in picker mode with nothing chosen, which happens when the
    // user has no applications at all. The page guards that case too; this is the
    // belt to its braces, because posting a blank parent would 404 confusingly.
    const parentId = isEdit ? null : (applicationId ?? chosenApplication);

    if (!isEdit && !parentId) {
      setApplicationError("Choose which application this interview is for");

      return;
    }

    try {
      const response = await fetch(isEdit ? `/api/interviews/${interview.id}` : "/api/interviews", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * Raw form values, not the parsed payload: the schema's input side is all
         * strings and the API re-validates with the same schema, so posting
         * `scheduledAt` as a `Date` would have the server reject its own output.
         * The contract the onboarding wizard learned the hard way.
         */
        body: JSON.stringify(isEdit ? getValues() : { applicationId: parentId, ...getValues() }),
      });

      if (!response.ok) {
        const { message, fields } = await readApiError(
          response,
          isEdit ? "Could not save that interview." : "Could not schedule that interview.",
        );

        let placed = false;

        for (const [name, error] of Object.entries(fields)) {
          if (isFieldName(name)) {
            setError(name, { message: error });
            placed = true;
          } else if (name === "applicationId") {
            setApplicationError(error);
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
        title: isEdit ? "Interview updated" : "Interview scheduled",
        description: INTERVIEW_TYPE_LABELS[getValues("type")],
      });

      // The page is a Server Component and the lists are split on `now`, so a
      // re-render from the server is the only thing that puts a new round in the
      // right group.
      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  const onSubmit = handleSubmit(() => save());

  const applicationChoices = (applicationOptions ?? []).map((option) => ({
    value: option.id,
    label: option.jobTitle,
    hint: option.companyName,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {isEdit ? (
        <Button variant="ghost" size="icon-sm" render={<DialogTrigger />}>
          <PencilLine aria-hidden="true" />
          <span className="sr-only">Edit this interview</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" render={<DialogTrigger />}>
          <CalendarPlus aria-hidden="true" data-icon="inline-start" />
          Schedule
        </Button>
      )}

      {/* Wider than the default dialog: this form has eight fields, and at
          `max-w-lg` the two-column rows would each be too narrow to read. */}
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit interview" : "Schedule an interview"}</DialogTitle>

          <DialogDescription>
            Times are in your timezone ({timeZone.replace(/_/g, " ")}), stored in UTC.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="mt-6">
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            {!isEdit && applicationOptions ? (
              <Field data-invalid={!!applicationError}>
                <FieldLabel htmlFor={`${fieldId}-application`}>Application</FieldLabel>

                <EnumSelect
                  id={`${fieldId}-application`}
                  value={chosenApplication}
                  onValueChange={(next) => {
                    setChosenApplication(next);
                    setApplicationError(null);
                  }}
                  options={applicationChoices}
                  invalid={!!applicationError}
                  describedBy={applicationError ? `${fieldId}-application-error` : undefined}
                  disabled={isSubmitting}
                />

                {applicationError ? (
                  <FieldError id={`${fieldId}-application-error`}>{applicationError}</FieldError>
                ) : null}
              </Field>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.type}>
                <FieldLabel htmlFor={`${fieldId}-type`}>Round</FieldLabel>

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
                      disabled={isSubmitting}
                    />
                  )}
                />

                <FieldError errors={[errors.type]} />
              </Field>

              <Field data-invalid={!!errors.result}>
                <FieldLabel htmlFor={`${fieldId}-result`}>Result</FieldLabel>

                <Controller
                  control={control}
                  name="result"
                  render={({ field }) => (
                    <EnumSelect
                      id={`${fieldId}-result`}
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={RESULT_OPTIONS}
                      invalid={!!errors.result}
                      disabled={isSubmitting}
                    />
                  )}
                />

                <FieldDescription>Leave as is until you hear back.</FieldDescription>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
              <Field data-invalid={!!errors.scheduledAt}>
                <FieldLabel htmlFor={`${fieldId}-scheduledAt`}>Date and time</FieldLabel>

                {/*
                 * No `min`. A past interview is valid — §8 is explicit that
                 * post-hoc logging is normal, and someone recording the round they
                 * just finished is the second most common use of this form.
                 */}
                <Input
                  id={`${fieldId}-scheduledAt`}
                  type="datetime-local"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.scheduledAt || undefined}
                  {...register("scheduledAt")}
                />

                <FieldError errors={[errors.scheduledAt]} />
              </Field>

              <Field data-invalid={!!errors.durationMinutes}>
                <FieldLabel htmlFor={`${fieldId}-durationMinutes`}>Minutes</FieldLabel>

                <Input
                  id={`${fieldId}-durationMinutes`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_INTERVIEW_MINUTES}
                  placeholder="60"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.durationMinutes || undefined}
                  {...register("durationMinutes")}
                />

                <FieldError errors={[errors.durationMinutes]} />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.interviewerName}>
                <FieldLabel htmlFor={`${fieldId}-interviewerName`}>Interviewer</FieldLabel>

                <Input
                  id={`${fieldId}-interviewerName`}
                  placeholder="Optional — who you are meeting"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.interviewerName || undefined}
                  {...register("interviewerName")}
                />

                <FieldError errors={[errors.interviewerName]} />
              </Field>

              <Field data-invalid={!!errors.meetingUrl}>
                <FieldLabel htmlFor={`${fieldId}-meetingUrl`}>Meeting link</FieldLabel>

                <Input
                  id={`${fieldId}-meetingUrl`}
                  type="url"
                  placeholder="Optional"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.meetingUrl || undefined}
                  {...register("meetingUrl")}
                />

                <FieldError errors={[errors.meetingUrl]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.prepNotes}>
              <FieldLabel htmlFor={`${fieldId}-prepNotes`}>Prep notes</FieldLabel>

              <Textarea
                id={`${fieldId}-prepNotes`}
                rows={3}
                placeholder="What to revise, questions to ask, things to look up"
                disabled={isSubmitting}
                aria-invalid={!!errors.prepNotes || undefined}
                {...register("prepNotes")}
              />

              <FieldError errors={[errors.prepNotes]} />
            </Field>

            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor={`${fieldId}-notes`}>How it went</FieldLabel>

              <Textarea
                id={`${fieldId}-notes`}
                rows={3}
                placeholder="Fill this in afterwards — what was asked, how you answered"
                disabled={isSubmitting}
                aria-invalid={!!errors.notes || undefined}
                {...register("notes")}
              />

              <FieldError errors={[errors.notes]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isSubmitting}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof InterviewFormValues;

const FIELD_NAMES: FieldName[] = [
  "type",
  "scheduledAt",
  "durationMinutes",
  "meetingUrl",
  "interviewerName",
  "prepNotes",
  "notes",
  "result",
];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}
