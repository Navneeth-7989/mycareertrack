"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { TagInput } from "@/components/onboarding/tag-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { readApiError } from "@/lib/api/read-error";
import { WORK_MODES, WORK_MODE_LABELS } from "@/lib/constants/work-mode";
import { detectTimeZone } from "@/lib/utils/timezone";
import {
  STEP_FIELDS,
  onboardingSchema,
  type OnboardingFormValues,
  type OnboardingPayload,
} from "@/lib/validations/profile";

type FieldName = keyof OnboardingFormValues;

const STEPS = [
  {
    title: "About you",
    description: "The basics, so your applications have context.",
  },
  {
    title: "Your links",
    description: "LinkedIn is required — recruiters ask for it first.",
  },
  {
    title: "What you're looking for",
    description: "All optional. You can change any of this later in settings.",
  },
] as const;

const LAST_STEP = STEPS.length - 1;

function isFieldName(value: string): value is FieldName {
  return STEP_FIELDS.some((fields) => fields.some((field) => field === value));
}

function stepForField(field: FieldName): number {
  const index = STEP_FIELDS.findIndex((fields) => fields.some((name) => name === field));

  return index === -1 ? 0 : index;
}

/**
 * The multi-step onboarding wizard (DESIGN.md §7, Phase 1).
 *
 * One `useForm` across all three steps rather than three forms: the submission
 * is a single request, and a user who steps back must find their answers still
 * there. Steps are validated individually with `trigger`, so step 2's required
 * LinkedIn doesn't light up while the user is still on step 1.
 */
export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  // Three generics because the schema transforms: the form holds strings, while
  // the submit handler receives the parsed payload — graduation year already an
  // Int, empty optional URLs already null.
  const {
    register,
    control,
    handleSubmit,
    trigger,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues, unknown, OnboardingPayload>({
    resolver: zodResolver(onboardingSchema),
    mode: "onTouched",
    defaultValues: {
      // Google and GitHub populate User.name from the provider profile, so for
      // an OAuth sign-up this arrives already filled in.
      name: defaultName,
      university: "",
      degree: "",
      graduationYear: "",
      linkedinUrl: "",
      githubUrl: "",
      portfolioUrl: "",
      targetRoles: [],
      skills: [],
      preferredLocations: [],
      preferredWorkMode: "",
    },
  });

  async function goNext() {
    // The `?? [0]` satisfies noUncheckedIndexedAccess — `step` is a number, so
    // the compiler can't see that it is always a valid index.
    const valid = await trigger([...(STEP_FIELDS[step] ?? STEP_FIELDS[0])]);

    if (valid) {
      setFormError(null);
      setStep((current) => Math.min(current + 1, LAST_STEP));
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The timezone has no field in the form — it is read from the browser
      // here, which is the "detected at signup" half of DESIGN.md §10.4.
      body: JSON.stringify({ ...values, timezone: detectTimeZone() }),
    });

    if (!response.ok) {
      const { message, fields } = await readApiError(response);
      const named = Object.entries(fields).filter(([name]) => isFieldName(name));

      for (const [name, fieldMessage] of named) {
        if (isFieldName(name)) {
          setError(name, { message: fieldMessage });
        }
      }

      // A server-side field error on a step the user has already left would be
      // invisible, so go back to the step that owns the first one.
      const firstField = named[0]?.[0];

      if (firstField && isFieldName(firstField)) {
        setStep(stepForField(firstField));
      } else {
        setFormError(message);
      }

      return;
    }

    router.replace("/dashboard");
    // The (app) layout reads onboardingCompleted from the database on every
    // request, so a refresh is all the gate needs to let us through.
    router.refresh();
  });

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // Enter advances instead of submitting a form the user hasn't finished.
    // defaultPrevented means a child already handled it — the tag inputs use
    // Enter to commit a chip.
    if (event.key !== "Enter" || event.defaultPrevented || step === LAST_STEP) {
      return;
    }

    event.preventDefault();
    void goNext();
  }

  const current = STEPS[step] ?? STEPS[0];

  return (
    <form onSubmit={onSubmit} onKeyDown={handleKeyDown} noValidate>
      <FieldGroup>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h1 className="font-heading text-lg font-medium">{current.title}</h1>
            <span className="text-muted-foreground text-xs">
              Step {step + 1} of {STEPS.length}
            </span>
          </div>

          <p className="text-muted-foreground text-sm">{current.description}</p>

          <div className="flex gap-1" aria-hidden="true">
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full ${
                  index <= step ? "bg-primary" : "bg-foreground/10"
                }`}
              />
            ))}
          </div>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        {step === 0 && (
          <>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                autoComplete="name"
                autoFocus
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={Boolean(errors.university)}>
              <FieldLabel htmlFor="university">University</FieldLabel>
              <Input
                id="university"
                autoComplete="organization"
                aria-invalid={Boolean(errors.university)}
                {...register("university")}
              />
              <FieldError errors={[errors.university]} />
            </Field>

            <Field data-invalid={Boolean(errors.degree)}>
              <FieldLabel htmlFor="degree">Degree</FieldLabel>
              <Input
                id="degree"
                placeholder="B.Tech Computer Science"
                aria-invalid={Boolean(errors.degree)}
                {...register("degree")}
              />
              <FieldError errors={[errors.degree]} />
            </Field>

            <Field data-invalid={Boolean(errors.graduationYear)}>
              <FieldLabel htmlFor="graduationYear">Graduation year</FieldLabel>
              <Input
                id="graduationYear"
                inputMode="numeric"
                maxLength={4}
                placeholder="2027"
                aria-invalid={Boolean(errors.graduationYear)}
                {...register("graduationYear")}
              />
              <FieldError errors={[errors.graduationYear]} />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field data-invalid={Boolean(errors.linkedinUrl)}>
              <FieldLabel htmlFor="linkedinUrl">LinkedIn profile</FieldLabel>
              <Input
                id="linkedinUrl"
                autoFocus
                placeholder="linkedin.com/in/your-name"
                aria-invalid={Boolean(errors.linkedinUrl)}
                {...register("linkedinUrl")}
              />
              {errors.linkedinUrl ? (
                <FieldError errors={[errors.linkedinUrl]} />
              ) : (
                <FieldDescription>https:// is added for you.</FieldDescription>
              )}
            </Field>

            <Field data-invalid={Boolean(errors.githubUrl)}>
              <FieldLabel htmlFor="githubUrl">GitHub (optional)</FieldLabel>
              <Input
                id="githubUrl"
                placeholder="github.com/your-name"
                aria-invalid={Boolean(errors.githubUrl)}
                {...register("githubUrl")}
              />
              <FieldError errors={[errors.githubUrl]} />
            </Field>

            <Field data-invalid={Boolean(errors.portfolioUrl)}>
              <FieldLabel htmlFor="portfolioUrl">Portfolio (optional)</FieldLabel>
              <Input
                id="portfolioUrl"
                placeholder="your-name.dev"
                aria-invalid={Boolean(errors.portfolioUrl)}
                {...register("portfolioUrl")}
              />
              <FieldError errors={[errors.portfolioUrl]} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field data-invalid={Boolean(errors.targetRoles)}>
              <FieldLabel htmlFor="targetRoles">Target roles</FieldLabel>
              <Controller
                control={control}
                name="targetRoles"
                render={({ field }) => (
                  <TagInput
                    id="targetRoles"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Backend Engineer — press Enter to add"
                  />
                )}
              />
              <FieldError errors={[errors.targetRoles]} />
            </Field>

            <Field data-invalid={Boolean(errors.skills)}>
              <FieldLabel htmlFor="skills">Skills</FieldLabel>
              <Controller
                control={control}
                name="skills"
                render={({ field }) => (
                  <TagInput
                    id="skills"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="TypeScript, Postgres"
                  />
                )}
              />
              <FieldError errors={[errors.skills]} />
            </Field>

            <Field data-invalid={Boolean(errors.preferredLocations)}>
              <FieldLabel htmlFor="preferredLocations">Preferred locations</FieldLabel>
              <Controller
                control={control}
                name="preferredLocations"
                render={({ field }) => (
                  <TagInput
                    id="preferredLocations"
                    value={field.value ?? []}
                    onChange={field.onChange}
                    placeholder="Bengaluru, Remote"
                  />
                )}
              />
              <FieldError errors={[errors.preferredLocations]} />
            </Field>

            <Controller
              control={control}
              name="preferredWorkMode"
              render={({ field }) => (
                <FieldSet>
                  <FieldLegend variant="label">Work mode</FieldLegend>
                  <RadioGroup
                    value={field.value ?? ""}
                    onValueChange={(value) =>
                      field.onChange(typeof value === "string" ? value : "")
                    }
                  >
                    {[
                      ...WORK_MODES.map((mode) => ({
                        value: mode,
                        label: WORK_MODE_LABELS[mode],
                      })),
                      { value: "", label: "No preference" },
                    ].map(({ value, label }) => (
                      <FieldLabel key={label} className="items-center gap-2 font-normal">
                        <RadioGroupItem value={value} />
                        {label}
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                </FieldSet>
              )}
            />
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={() => setStep((current) => current - 1)}
              disabled={isSubmitting}
            >
              Back
            </Button>
          ) : (
            <span />
          )}

          {step === LAST_STEP ? (
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Finish"}
            </Button>
          ) : (
            <Button type="button" size="lg" onClick={() => void goNext()}>
              Continue
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
