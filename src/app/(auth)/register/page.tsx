import type { Metadata } from "next";
import Link from "next/link";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export const metadata: Metadata = {
  title: "Create an account · CareerTrack",
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The form asks for email and password only. Name, university, degree,
 * graduation year and LinkedIn are collected by the onboarding wizard, which
 * has to run for Google and GitHub sign-ups anyway — asking here as well would
 * mean two places that must agree on what "complete" means (DESIGN.md §3).
 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const callbackUrl = safeRedirectPath(params.callbackUrl);

  return (
    <>
      {/* 20px rather than the default 24 — the auth cards are the one place in
          the app where the card has to fit a laptop viewport whole, footer line
          included, and 20px is still a long way from cramped. */}
      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Start tracking applications in a couple of minutes.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <OAuthButtons callbackUrl={callbackUrl} />

          <FieldSeparator>or</FieldSeparator>

          <RegisterForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-4 text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-primary font-medium underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
