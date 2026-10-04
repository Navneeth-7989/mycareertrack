import { Button } from "@/components/ui/button";
import { signInWithProvider } from "@/server/actions/auth";

/**
 * Google and GitHub sign-in, as two forms posting to a Server Action.
 *
 * Deliberately not a client component: an OAuth sign-in is a redirect, and a
 * form gives us that for free — these buttons work with JavaScript still
 * loading, and there is no client-side auth code to ship.
 */

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.58-5.17 3.58-8.84Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.89l-3.88-3.02c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.3v3.13A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28a7.2 7.2 0 0 1 0-4.56V6.59H1.3a12 12 0 0 0 0 10.82l3.98-3.13Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.3 6.59l3.98 3.13C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.25-1.28-5.25-5.71 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.3 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.48 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.44-2.69 5.41-5.26 5.7.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.79.56A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * Side by side rather than stacked, and labelled with the provider alone.
 *
 * Stacked, these two were 88px of the register card — enough on their own to
 * push the "already have an account?" line below the fold of a 1366x768 laptop.
 * One row is 40px and costs nothing: the icon already says which service it is,
 * so "Continue with" was carrying no information twice over.
 *
 * The full phrase stays as the accessible name — "Google" on its own is a
 * noun, not an action, and that is what a screen reader would read out.
 */
export function OAuthButtons({ callbackUrl }: { callbackUrl: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          { provider: "google", label: "Google", icon: <GoogleIcon /> },
          { provider: "github", label: "GitHub", icon: <GitHubIcon /> },
        ] as const
      ).map(({ provider, label, icon }) => (
        <form key={provider} action={signInWithProvider}>
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="w-full"
            aria-label={`Continue with ${label}`}
          >
            {icon}
            {label}
          </Button>
        </form>
      ))}
    </div>
  );
}
