import { CalendarClock } from "lucide-react";

import { InterviewDialog } from "@/components/interviews/interview-dialog";
import { InterviewRow, type InterviewRowData } from "@/components/interviews/interview-row";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The rounds scheduled against one application.
 *
 * Rendered whether or not there are any, unlike the contacts card beside it,
 * which is omitted when empty. The difference is that this one has a working
 * action: an empty card with a Schedule button is a prompt, where an empty card
 * with nothing to click is dead space. That was the exact reason the contacts card
 * was hidden in Phase 2 — there was no way to add one from this page — and step 4
 * is what changes it.
 *
 * Reads live rows rather than timeline events, which is why no event is written
 * when a round is scheduled. See `mutations/interviews` for that decision.
 */
export function DetailInterviews({
  applicationId,
  interviews,
  timeZone,
}: {
  applicationId: string;
  interviews: InterviewRowData[];
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          Interviews
          {interviews.length > 0 ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {interviews.length}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>
          In the order they happen, so the rounds read as a sequence.
        </CardDescription>

        <CardAction>
          <InterviewDialog timeZone={timeZone} applicationId={applicationId} />
        </CardAction>
      </CardHeader>

      <CardContent>
        {interviews.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2.5 py-2 text-sm">
            <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
            No rounds scheduled for this application yet.
          </div>
        ) : (
          <ul className="flex flex-col">
            {interviews.map((interview) => (
              <InterviewRow key={interview.id} interview={interview} timeZone={timeZone} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
