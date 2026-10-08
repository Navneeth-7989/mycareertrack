import { ClipboardCheck } from "lucide-react";

import { AssessmentDialog } from "@/components/assessments/assessment-dialog";
import { AssessmentRow, type AssessmentRowData } from "@/components/assessments/assessment-row";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The tests set by one application.
 *
 * Ungrouped, unlike `/assessments`. Grouping exists there to answer "what am I
 * about to miss" across a whole search; within one application there are rarely
 * more than two, and three headings over two rows would be scaffolding without a
 * building. The row still flags an overdue deadline on its own, which is the part
 * that matters.
 */
export function DetailAssessments({
  applicationId,
  assessments,
}: {
  applicationId: string;
  assessments: AssessmentRowData[];
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>
          Assessments
          {assessments.length > 0 ? (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {assessments.length}
            </span>
          ) : null}
        </CardTitle>
        <CardDescription>Soonest deadline first, so what is due stays visible.</CardDescription>

        <CardAction>
          <AssessmentDialog applicationId={applicationId} />
        </CardAction>
      </CardHeader>

      <CardContent>
        {assessments.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2.5 py-2 text-sm">
            <ClipboardCheck aria-hidden="true" className="size-4 shrink-0" />
            No tests recorded for this application yet.
          </div>
        ) : (
          <ul className="flex flex-col">
            {assessments.map((assessment) => (
              <AssessmentRow key={assessment.id} assessment={assessment} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
