"use server";

import { safeRedirectPath } from "@/lib/utils/safe-redirect";

import { signIn, signOut } from "../auth";

/**
 * Sign-in and sign-out as Server Actions, so the OAuth buttons and the sign-out
 * control are plain forms that work before any JavaScript loads. Both are
 * single-purpose redirects with no validation to speak of, which is the narrow
 * case DESIGN.md §4 reserves Server Actions for.
 */

const OAUTH_PROVIDERS = ["google", "github"] as const;

type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === "string" && OAUTH_PROVIDERS.includes(value as OAuthProvider);
}

/**
 * The provider arrives in form data, which means it arrives from the client and
 * cannot be trusted. The allow-list is what stops a crafted request from
 * nominating a different provider — "credentials" in particular, which would
 * reach `authorize()` with no password at all.
 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = formData.get("provider");

  if (!isOAuthProvider(provider)) {
    throw new Error("Unsupported sign-in provider");
  }

  const redirectTo = safeRedirectPath(formData.get("callbackUrl")?.toString());

  // signIn() completes by throwing Next's redirect signal, so nothing below
  // this line runs and the function never actually returns.
  await signIn(provider, { redirectTo });
}

export async function signOutUser(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
