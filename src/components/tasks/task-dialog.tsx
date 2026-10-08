"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
import { PRIORITIES, PRIORITY_LABELS } from "@/lib/constants/application";
import {
  EMPTY_TASK_FORM,
  taskFormSchema,
  toTaskFormValues,
  type TaskFormPayload,
  type TaskFormSource,
  type TaskFormValues,
} from "@/lib/validations/task";
import type { ApplicationOption } from "@/server/queries/interviews";

/**
 * Add or edit a task.
 *
 * **The application picker is always optional here**, which is what separates this
 * from the interview and assessment dialogs. §3 allows standalone tasks, so the
 * picker offers an explicit "Not tied to an application" row rather than requiring a
 * choice — and that row is reachable on edit too, which is how a task gets detached.
 *
 * `applicationId` is also editable on edit, again unlike interviews and assessments:
 * moving a task between applications, or off them entirely, is a real intent.
 */

const PRIORITY_OPTIONS = enumOptions(PRIORITIES, PRIORITY_LABELS);

/** The picker's "no application" row. Empty string, which the schema turns into null. */
const NO_APPLICATION = "";

export type TaskToEdit = TaskFormSource & {
  id: string;
  applicationId: string | null;
};

export function TaskDialog({
  task,
  applicationId,
  applicationOptions,
  trigger = "button",
}: {
  task?: TaskToEdit;
  /** Fixes the parent, for a task added from an application's detail page. */
  applicationId?: string;
  /** Offers a picker, for the tasks page. */
  applicationOptions?: ApplicationOption[];
  trigger?: "button" | "icon";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEdit = task !== undefined;
  const fieldId = useId();

  /**
   * Which application the task hangs off, or `NO_APPLICATION`.
   *
   * Outside the form because it is not one of the task's own fields — the same
   * arrangement as the other two dialogs — but unlike them it is meaningful on edit
   * as well, so it seeds from the stored value.
   */
  const [chosenApplication, setChosenApplication] = useState(
    task?.applicationId ?? applicationId ?? NO_APPLICATION,
  );

  const {
    register,
    control,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
    // The third generic is the *form* schema's output, which carries no
    // `applicationId` — that is held outside the form and posted alongside.
  } = useForm<TaskFormValues, unknown, TaskFormPayload>({
    resolver: zodResolver(taskFormSchema),
    mode: "onTouched",
    defaultValues: task ? toTaskFormValues(task) : EMPTY_TASK_FORM,
  });

  function onOpenChange(next: boolean) {
    if (next) {
      setFormError(null);
      setChosenApplication(task?.applicationId ?? applicationId ?? NO_APPLICATION);
      reset(task ? toTaskFormValues(task) : EMPTY_TASK_FORM);
    }

    setOpen(next);
  }

  async function save() {
    setFormError(null);

    try {
      const response = await fetch(isEdit ? `/api/tasks/${task.id}` : "/api/tasks", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        // Raw values: the schema's input side is all strings and the API
        // re-validates with the same schema.
        body: JSON.stringify({
          // Sent in both directions, unlike the other dialogs — re-parenting is
          // allowed. An empty string means "no application", which the schema turns
          // into null.
          applicationId: applicationId ?? chosenApplication,
          ...getValues(),
        }),
      });

      if (!response.ok) {
        const { message, fields } = await readApiError(
          response,
          isEdit ? "Could not save that task." : "Could not add that task.",
        );

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
        title: isEdit ? "Task updated" : "Task added",
        description: getValues("title"),
      });

      // The buckets are computed from the due date, which may have just moved.
      router.refresh();
    } catch {
      setFormError("Check your connection and try again.");
    }
  }

  const onSubmit = handleSubmit(() => save());

  /*
   * "Not tied to an application" is a real row rather than a placeholder, for the
   * reason `EnumSelect` documents about optional enums: once someone has picked an
   * application by mistake, a placeholder is unreachable and there is no way back to
   * "none".
   */
  const applicationChoices = [
    { value: NO_APPLICATION, label: "Not tied to an application" },
    ...(applicationOptions ?? []).map((option) => ({
      value: option.id,
      label: option.jobTitle,
      hint: option.companyName,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger === "icon" ? (
        <Button variant="ghost" size="icon-sm" render={<DialogTrigger />}>
          <PencilLine aria-hidden="true" />
          <span className="sr-only">Edit “{task?.title ?? "task"}”</span>
        </Button>
      ) : (
        <Button variant="outline" size="sm" render={<DialogTrigger />}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          Add task
        </Button>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "Add a task"}</DialogTitle>

          <DialogDescription>
            Something to do. It can hang off an application or stand on its own.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="mt-6">
          {formError ? (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor={`${fieldId}-title`}>Task</FieldLabel>

              <Input
                id={`${fieldId}-title`}
                placeholder="Follow up with the recruiter"
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={!!errors.title || undefined}
                {...register("title")}
              />

              <FieldError errors={[errors.title]} />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.dueDate}>
                <FieldLabel htmlFor={`${fieldId}-dueDate`}>Due</FieldLabel>

                {/*
                 * No bounds. A task already overdue when it is written down is
                 * normal — people add the thing they have just realised they are
                 * late on — and a task with no date at all is a someday item.
                 */}
                <Input
                  id={`${fieldId}-dueDate`}
                  type="date"
                  disabled={isSubmitting}
                  aria-invalid={!!errors.dueDate || undefined}
                  {...register("dueDate")}
                />

                {errors.dueDate ? (
                  <FieldError errors={[errors.dueDate]} />
                ) : (
                  <FieldDescription>Optional.</FieldDescription>
                )}
              </Field>

              <Field data-invalid={!!errors.priority}>
                <FieldLabel htmlFor={`${fieldId}-priority`}>Priority</FieldLabel>

                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <EnumSelect
                      id={`${fieldId}-priority`}
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      options={PRIORITY_OPTIONS}
                      invalid={!!errors.priority}
                      disabled={isSubmitting}
                    />
                  )}
                />

                <FieldError errors={[errors.priority]} />
              </Field>
            </div>

            {/* Hidden when the parent is fixed by the page that opened this. */}
            {!applicationId ? (
              <Field>
                <FieldLabel htmlFor={`${fieldId}-application`}>Application</FieldLabel>

                <EnumSelect
                  id={`${fieldId}-application`}
                  value={chosenApplication}
                  onValueChange={setChosenApplication}
                  options={applicationChoices}
                  disabled={isSubmitting}
                />
              </Field>
            ) : null}

            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor={`${fieldId}-description`}>Details</FieldLabel>

              <Textarea
                id={`${fieldId}-description`}
                rows={3}
                placeholder="Optional — anything you need to remember to do it"
                disabled={isSubmitting}
                aria-invalid={!!errors.description || undefined}
                {...register("description")}
              />

              <FieldError errors={[errors.description]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button variant="outline" size="lg" render={<DialogClose />} disabled={isSubmitting}>
              Cancel
            </Button>

            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldName = keyof TaskFormValues;

const FIELD_NAMES = Object.keys(EMPTY_TASK_FORM) as FieldName[];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as string[]).includes(value);
}
