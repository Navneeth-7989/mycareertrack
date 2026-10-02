import { Button } from "@/components/ui/button";
import { signOutUser } from "@/server/actions/auth";

/**
 * A form rather than an onClick handler, so signing out clears the cookie
 * server-side and lands on a freshly rendered page — no client-side session
 * cache left holding the old user.
 */
export function SignOutButton() {
  return (
    <form action={signOutUser}>
      <Button type="submit" variant="outline" size="sm">
        Sign out
      </Button>
    </form>
  );
}
