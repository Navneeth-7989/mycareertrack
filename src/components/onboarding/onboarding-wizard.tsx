"use client";

import { useState, type KeyboardEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { cn } from "cn";

import { SearchableSelect } from "@/components/form/searchable-select";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { TagInput } from "@/components/onboarding/tag-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Checkbox, CheckboxGroup } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";
import { DEGREES } from "@/lib/constants/degrees";
import { FIELDS_OF_STUDY } from "@/lib/constants/fields-of-study";
import { UNIVERSITIES } from "@/lib/constants/universities";
import { WORK_MODES, WORK_MODE_LABELS, isWorkMode } from "@/lib/constants/work-mode";
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
    label: "About you",
    title: "About you",
    description: "The basics, so your applications have context.",
  },
  {
    label: "Your links",
    title: "Your links",
    description: "LinkedIn is required — recruiters ask for it first.",
  },
  {
    label: "Preferences",
    title: "What you're looking for",
    description: "All optional. You can change any of this later in settings.",
  },
] as const;

const STEP_LABELS = STEPS.map((step) => step.label);

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
 *
 * University, degree and field of study are comboboxes over curated lists, but
 * every one of them still accepts free text — see `SearchableSelect` for how,
 * and `lib/constants/` for why that is not negotiable.
 */
export function OnboardingWizard({
  defaultName,
  className,
}: {
  defaultName: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  /**
   * True from the moment the save succeeds until the browser has left for the
   * dashboard.
   *
   * It exists because `isSubmitting` goes false the instant the fetch resolves,
   * while the page it is navigating to can take seconds to render. Without this
   * the button quietly changed back to "Finish setup" mid-navigation, and the
   * whole screen looked idle — the user's reasonable reading was that clicking
   * it had done nothing at all.
   */
  const [isLeaving, setIsLeaving] = useState(false);

  // Three generics because the schema transforms: the form holds strings, while
  // the submit handler receives the parsed payload — graduation year already an
  // Int, empty optional URLs and an empty field of study already null.
  const {
    register,
    control,
    handleSubmit,
    getValues,
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
      fieldOfStudy: "",
      graduationYear: "",
      linkedinUrl: "",
      githubUrl: "",
      portfolioUrl: "",
      targetRoles: [],
      skills: [],
      preferredLocations: [],
      preferredWorkModes: [],
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

  // The argument this callback is handed is deliberately ignored: the resolver
  // has already *parsed* the form by then, so it holds a number for the year and
  // nulls for the blank optional URLs. The API re-validates the body with the
  // very same schema, whose input side is all strings — posting the parsed value
  // means the server answers "expected string, received number" for the year and
  // "expected string, received null" for an empty GitHub URL.
  //
  // So send what the schema is written to accept: the raw field values. The
  // server stays the single place that parses, which is the point of sharing one
  // schema (DESIGN.md §4). Validation still runs here first — `handleSubmit`
  // only calls this callback once the resolver is happy.
  const onSubmit = handleSubmit(async () => {
    setFormError(null);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The timezone has no field in the form — it is read from the browser
      // here, which is the "detected at signup" half of DESIGN.md §10.4.
      body: JSON.stringify({ ...getValues(), timezone: detectTimeZone() }),
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

    // Saved. Leaving the wizard is a full page load, not a client-side
    // navigation, and `isLeaving` stays true until it happens.
    //
    // It used to be `router.replace()` immediately followed by
    // `router.refresh()`. That fetched /dashboard twice and left the user
    // sitting on a finished wizard: the refresh raced the navigation it was
    // meant to support, and whichever resolved second discarded the other.
    //
    // A hard navigation removes the whole class of problem — no router cache
    // holding the redirect this route served before onboarding completed, no
    // transition to lose. It costs one extra page load, once per account, and
    // the browser's own progress indicator is better feedback than anything
    // repainted inside the card.
    //
    // `replace`, not `assign`: a completed wizard has no business in the back
    // history, and going back to it would only bounce off its own guard.
    //
    // `?welcome=1` is the handoff to the dashboard's toast. A hard navigation
    // discards every bit of client state, so the parameter is the only way the
    // next page can know this was a first arrival rather than a normal visit.
    // The dashboard strips it as soon as it has fired.
    setIsLeaving(true);
    window.location.replace("/dashboard?welcome=1");
  });

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    // defaultPrevented means a child already handled it — the tag inputs use
    // Enter to commit a chip.
    if (event.key !== "Enter" || event.defaultPrevented) {
      return;
    }

    const target = event.target as HTMLElement | null;

    // A focused button owns Enter itself. Without this, Enter on "Back" was
    // preventDefault-ed here and sent the user *forward* — the opposite of the
    // control they had their finger on.
    if (target?.closest("button")) {
      return;
    }

    // An open combobox owns Enter: it is how a university is chosen, and how
    // "Use what you typed" is accepted. Advancing the step as well would skip
    // past the selection the user just made.
    if (target?.getAttribute("aria-expanded") === "true") {
      return;
    }

    // Enter is handled here on every step, including the last, rather than
    // being left to the browser's implicit submission. Implicit submission is
    // what made a held-down Enter dangerous: the first keypress advanced to the
    // last step, and the repeat — now on a step this function used to bail out
    // of — submitted the wizard before the user had seen it.
    event.preventDefault();

    if (step === LAST_STEP) {
      if (!isSubmitting && !isLeaving) {
        void onSubmit();
      }

      return;
    }

    void goNext();
  }

  const current = STEPS[step] ?? STEPS[0];

  return (
    <div className={cn("flex flex-col gap-7", className)}>
      <StepIndicator steps={STEP_LABELS} current={step} />

      <form onSubmit={onSubmit} onKeyDown={handleKeyDown} noValidate>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{current.title}</CardTitle>
            <CardDescription>{current.description}</CardDescription>
          </CardHeader>

          <CardContent>
            <FieldGroup>
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
                    <Controller
                      control={control}
                      name="university"
                      render={({ field }) => (
                        <SearchableSelect
                          id="university"
                          options={UNIVERSITIES}
                          value={field.value ?? ""}
                          onValueChange={field.onChange}
                          placeholder="Search for your university"
                          invalid={Boolean(errors.university)}
                          describedBy="university-hint"
                        />
                      )}
                    />
                    {errors.university ? (
                      <FieldError errors={[errors.university]} />
                    ) : (
                      <FieldDescription id="university-hint">
                        Not listed? Type it in and pick “Use …” to keep your own.
                      </FieldDescription>
                    )}
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field data-invalid={Boolean(errors.degree)}>
                      <FieldLabel htmlFor="degree">Degree</FieldLabel>
                      <Controller
                        control={control}
                        name="degree"
                        render={({ field }) => (
                          <SearchableSelect
                            id="degree"
                            options={DEGREES}
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                            placeholder="B.Tech"
                            invalid={Boolean(errors.degree)}
                          />
                        )}
                      />
                      <FieldError errors={[errors.degree]} />
                    </Field>

                    <Field data-invalid={Boolean(errors.fieldOfStudy)}>
                      <FieldLabel htmlFor="fieldOfStudy">Field of study (optional)</FieldLabel>
                      <Controller
                        control={control}
                        name="fieldOfStudy"
                        render={({ field }) => (
                          <SearchableSelect
                            id="fieldOfStudy"
                            options={FIELDS_OF_STUDY}
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                            placeholder="Computer Science"
                            invalid={Boolean(errors.fieldOfStudy)}
                          />
                        )}
                      />
                      <FieldError errors={[errors.fieldOfStudy]} />
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
                  </div>
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
                          placeholder="Backend Engineer"
                        />
                      )}
                    />
                    {errors.targetRoles ? (
                      <FieldError errors={[errors.targetRoles]} />
                    ) : (
                      <FieldDescription>Press Enter after each one.</FieldDescription>
                    )}
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

                  {/* Checkboxes, not radios: "remote or hybrid, but not
                      on-site" is the normal answer. There is no "No
                      preference" option any more — ticking nothing says that,
                      and an explicit option for it was a third state that meant
                      the same as the empty one. */}
                  <Controller
                    control={control}
                    name="preferredWorkModes"
                    render={({ field }) => (
                      <FieldSet>
                        <FieldLegend variant="label">Work mode</FieldLegend>
                        <FieldDescription>
                          Tick every mode you would take. Leave all three clear if you have no
                          preference.
                        </FieldDescription>

                        <CheckboxGroup
                          value={field.value ?? []}
                          onValueChange={(values) => field.onChange(values.filter(isWorkMode))}
                          className="sm:grid-cols-3"
                        >
                          {WORK_MODES.map((mode) => (
                            <FieldLabel key={mode} className="items-center gap-2.5 font-normal">
                              <Field orientation="horizontal">
                                <Checkbox name={mode} />
                                <span className="text-sm">{WORK_MODE_LABELS[mode]}</span>
                              </Field>
                            </FieldLabel>
                          ))}
                        </CheckboxGroup>

                        <FieldError errors={[errors.preferredWorkModes]} />
                      </FieldSet>
                    )}
                  />
                </>
              )}
            </FieldGroup>
          </CardContent>

          <CardFooter className="justify-between gap-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setStep((current) => current - 1)}
                disabled={isSubmitting || isLeaving}
              >
                Back
              </Button>
            ) : (
              <span className="text-muted-foreground text-[0.8125rem]">
                Step {step + 1} of {STEPS.length}
              </span>
            )}

            {/* Both branches are type="button", and the last step submits from
                its own onClick rather than through the browser.

                "Finish setup" was a type="submit" button, which skipped the
                preferences step entirely: React reconciles these two branches
                into the *same* <button> node, so the click on "Continue" that
                moved the user onto the last step also rewrote that node's type
                to "submit" — and a button's activation behaviour is run after
                the event has finished dispatching, against whatever the type
                attribute says by then. One click, two buttons: it advanced the
                step and then submitted the form it had just turned into a
                submit button, so the preferences appeared for as long as the
                POST took and the user landed on the dashboard never having
                filled them in.

                Keeping the type fixed removes the activation behaviour from
                the equation rather than trying to out-race it. Enter is handled
                in `handleKeyDown`, so no submission path is lost. */}
            {step === LAST_STEP ? (
              <Button
                type="button"
                size="lg"
                onClick={() => void onSubmit()}
                disabled={isSubmitting || isLeaving}
              >
                {isLeaving ? "Opening your dashboard…" : isSubmitting ? "Saving…" : "Finish setup"}
              </Button>
            ) : (
              <Button type="button" size="lg" onClick={() => void goNext()}>
                Continue
              </Button>
            )}
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
