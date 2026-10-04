import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in · CareerTrack",
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * There is no "forgot password" link, deliberately — password reset is out of
 * this build (DESIGN.md §9), and a link to a page that doesn't exist is worse
 * than no link at all.
 *
 * `searchParams` is read here on the server rather than with `useSearchParams`
 * in the form, which keeps the page out of a Suspense boundary and lets the
 * callback URL be sanitised before it reaches the client.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const callbackUrl = safeRedirectPath(params.callbackUrl);
  const providerError = typeof params.error === "string" ? params.error : undefined;

  return (
    <>
      {/* See /register for why the card spacing is tightened on the auth pages. */}
      <Card className="[--card-spacing:--spacing(5)]">
        <CardHeader>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in to pick up where you left off.</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <OAuthButtons callbackUrl={callbackUrl} />

          <FieldSeparator>or</FieldSeparator>

          <LoginForm callbackUrl={callbackUrl} providerError={providerError} />
        </CardContent>
      </Card>

      {/* Outside the card: the card is for the one action, this is the way out. */}
      <p className="text-muted-foreground mt-4 text-center text-sm">
        New here?{" "}
        <Link
          href="/register"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
