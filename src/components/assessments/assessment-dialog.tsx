"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { ClipboardPlus, PencilLine } from "lucide-react";

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
  ASSESSMENT_STATUSES,
  ASSESSMENT_STATUS_HINTS,
  ASSESSMENT_STATUS_LABELS,
} from "@/lib/constants/assessment";
import {
  EMPTY_ASSESSMENT_FORM,
  assessmentFormSchema,
  toAssessmentFormValues,
  type AssessmentFormSource,
  type AssessmentFormValues,
  type AssessmentPayload,
} from "@/lib/validations/assessment";
import type { ApplicationOption } from "@/server/queries/interviews";

/**
 * Record or edit an assessment.
 *
 * The same three modes as `InterviewDialog`, distinguished by props rather than a
 * flag: `assessment` → edit, `applicationId` → create against that application,
 * `applicationOptions` → create with a picker.
 *
 * No timezone prop, unlike the interview dialog — a deadline is a calendar day, so
 * there is nothing to convert. That asymmetry is the point of keeping
 * `utils/date-only` and `utils/date-time` as separate files.
 */

const STATUS_OPTIONS = enumOptions(
  ASSESSMENT_STATUSES,
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_STATUS_HINTS,
);

export type AssessmentToEdit = AssessmentFormSource & { id: string };

export function AssessmentDialog({
  assessment,
  applicationId,
  applicationOptions,
}: {
  assessment?: AssessmentToEdit;
  applicationId?: string;
  applicationOptions?: ApplicationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = assessment !== undefined;
  const fieldId = useId();

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
  } = useForm<AssessmentFormValues, unknown, AssessmentPayload>({
    resolver: zodResolver(assessmentFormSchema),
    mode: "onTouched",
    defaultValues: assessment ? toAssessmentFormValues(assessment) : EMPTY_ASSESSMENT_FORM,
  });

  /**
   * Re-seeds on open, in the handler rather than an effect — the React Compiler's
   * `react-hooks/set-state-in-effect` rule. An abandoned edit must not re-open
   * showing the changes the user walked away from.
   */
  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      setApplicationError(null);
      setChosenApplication(applicationOptions?.[0]?.id ?? "");
      reset(assessment ? toAssessmentFormValues(assessment) : EMPTY_ASSESSMENT_FORM);
    }

    setOpen(next);
  }

  async function save() {
    setFormError(null);

    const parentId = isEdit ? null : (applicationId ?? chosenApplication);

    if (!isEdit && !parentId) {
      setApplicationError("Choose which application this assessment is for");

      return;
    }

    try {
      const response = await fetch(
        isEdit ? `/api/assessments/${assessment.id}` : "/api/assessments",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          // Raw values: the schema's input side is all strings and the API
          // re-validates with the same schema.
          body: JSON.stringify(isEdit ? getValues() : { applicationId: parentId, ...getValues() }),
        },
      );

      if (!response.ok) {
        const { message, fields } = await readApiError(
          response,
          isEdit ? "Could not save that assessment." : "Could not add that assessment.",
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
        title: isEdit ? "Assessment updated" : "Assessment added",
        description: getValues("name"),
      });

      // The groups on the assessments page are computed from the deadline and the
      // status, both of which may have just changed, so the server has to decide
      // which bucket this row now belongs to.
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
          <span className="sr-only">Edit “{assessment.name}”</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" render={<DialogTrigger />}>
          <ClipboardPlus aria-hidden="true" data-icon="inline-start" />
          Add assessment
        </Button>
      )}

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit assessment" : "Add an assessment"}</DialogTitle>

          <DialogDescription>
            An online test or take-home. The deadline is what gets surfaced, so add it if you have
            one.
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
                  disabled={isSubmitting}
                />

                {applicationError ? <FieldError>{applicationError}</FieldError> : null}
              </Field>
            ) : null}

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor={`${fieldId}-name`}>Name</FieldLabel>

                <Input
                  id={`${fieldId}-name`}
                  placeholder="Online assessment — round 1"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.name || undefined}
                  {...register("name")}
                />

                <FieldError errors={[errors.name]} />
              </Field>

              <Field data-invalid={!!errors.provider}>
                <FieldLabel htmlFor={`${fieldId}-provider`}>Provider</FieldLabel>

                <Input
                  id={`${fieldId}-provider`}
                  placeholder="HackerRank, Codility, take-home…"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.provider || undefined}
                  {...register("provider")}
                />

                <FieldError errors={[errors.provider]} />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.deadline}>
                <FieldLabel htmlFor={`${fieldId}-deadline`}>Deadline</FieldLabel>

                {/*
                 * No `max` and no `min`. §8 is explicit that a past deadline is
                 * allowed and merely flagged — people log things late — so the
                 * control must not refuse one.
                 */}
                <Input
                  id={`${fieldId}-deadline`}
                  type="date"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.deadline || undefined}
                  {...register("deadline")}
                />

                {errors.deadline ? (
                  <FieldError errors={[errors.deadline]} />
                ) : (
                  <FieldDescription>Leave blank if there is no fixed date.</FieldDescription>
                )}
              </Field>

              <Field data-invalid={!!errors.status}>
                <FieldLabel htmlFor={`${fieldId}-status`}>Status</FieldLabel>

                <Controller
                  control={control}
                  name="status"
                  render={({ field }) => (
                    <EnumSelect
                      id={`${fieldId}-status`}
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={STATUS_OPTIONS}
                      invalid={!!errors.status}
                      disabled={isSubmitting}
                    />
                  )}
                />

                <FieldError errors={[errors.status]} />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
              <Field data-invalid={!!errors.url}>
                <FieldLabel htmlFor={`${fieldId}-url`}>Link</FieldLabel>

                <Input
                  id={`${fieldId}-url`}
                  type="url"
                  placeholder="Optional — where to take it"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.url || undefined}
                  {...register("url")}
                />

                <FieldError errors={[errors.url]} />
              </Field>

              <Field data-invalid={!!errors.score}>
                <FieldLabel htmlFor={`${fieldId}-score`}>Score</FieldLabel>

                {/*
                 * Free text, not a number — §3 is explicit: real scores look like
                 * "180/200", "85%" and "Passed with distinction".
                 */}
                <Input
                  id={`${fieldId}-score`}
                  placeholder="180/200"
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.score || undefined}
                  {...register("score")}
                />

                <FieldError errors={[errors.score]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor={`${fieldId}-notes`}>Notes</FieldLabel>

              <Textarea
                id={`${fieldId}-notes`}
                rows={3}
                placeholder="What it covered, how it went, anything to remember for next time"
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
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add assessment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof AssessmentFormValues;

const FIELD_NAMES = Object.keys(EMPTY_ASSESSMENT_FORM) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}
