"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { credentialsSignInSchema } from "@/lib/validations/auth";

type FormValues = z.input<typeof credentialsSignInSchema>;

/**
 * One message for every possible credentials failure — wrong password, no such
 * account, or an OAuth-only account with no password set.
 *
 * Being specific here would turn the form into an email-enumeration oracle
 * (DESIGN.md §8). The provider hint is the compromise the design asks for in
 * §8's edge-case table: it tells an OAuth user what to do without confirming
 * that this particular email is registered, because the sentence is identical
 * whether or not it is.
 */
const SIGN_IN_FAILED =
  "Invalid email or password. If you created this account with Google or GitHub, use one of the buttons above.";

/**
 * Maps the `?error=` codes Auth.js sends to pages.error. Everything unlisted
 * falls through to a generic message rather than showing the user a raw code.
 */
const PROVIDER_ERRORS: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already registered with a different sign-in method. Use the one you signed up with.",
  AccessDenied: "That sign-in was cancelled or declined.",
  Configuration: "Sign-in is misconfigured. Please try again later.",
};

export function LoginForm({
  callbackUrl,
  providerError,
}: {
  callbackUrl: string;
  providerError?: string;
}) {
  const router = useRouter();

  const [formError, setFormError] = useState<string | null>(
    providerError ? (PROVIDER_ERRORS[providerError] ?? "Sign-in failed. Please try again.") : null,
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(credentialsSignInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    const result = await signIn("credentials", { ...values, redirect: false });

    if (result.error) {
      setFormError(SIGN_IN_FAILED);
      return;
    }

    router.push(callbackUrl);
    // The sign-in cookie is new, so any server-rendered payload the router
    // already holds was rendered for an anonymous visitor.
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
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
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
