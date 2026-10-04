"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { PasswordInput } from "@/components/form/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { readApiError } from "@/lib/api/read-error";
import { registerSchema } from "@/lib/validations/auth";

type FormValues = z.input<typeof registerSchema>;

const FIELD_NAMES = ["email", "password", "confirmPassword"] as const;

function isFieldName(value: string): value is (typeof FIELD_NAMES)[number] {
  return FIELD_NAMES.includes(value as (typeof FIELD_NAMES)[number]);
}

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);

    // confirmPassword is not sent — it exists to catch a typo in the browser,
    // and the server has no use for it (see registerPayloadSchema).
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const { message, fields } = await readApiError(response);
      const entries = Object.entries(fields);

      // A 409 on the email, or a 400 the client-side schema somehow let
      // through, is attached to the input it belongs to. Anything without a
      // field lands above the form.
      for (const [name, fieldMessage] of entries) {
        if (isFieldName(name)) {
          setError(name, { message: fieldMessage });
        }
      }

      if (!entries.some(([name]) => isFieldName(name))) {
        setFormError(message);
      }

      return;
    }

    // Registration deliberately doesn't issue a session; signing in through the
    // normal credentials flow keeps one path for session creation.
    const result = await signIn("credentials", { email, password, redirect: false });

    if (result.error) {
      // The account exists, so send them to the form rather than leaving them
      // on a page that looks like it failed outright.
      setFormError("Account created, but sign-in failed. Please sign in.");
      router.push("/login");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* gap-4, not the default gap-5: see /register for the height budget. */}
      <FieldGroup className="gap-4">
        {formError && (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          {errors.password ? (
            <FieldError errors={[errors.password]} />
          ) : (
            <FieldDescription>At least 8 characters.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            {...register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>

        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
