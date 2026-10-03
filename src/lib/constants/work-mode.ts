/**
 * Display metadata for the `WorkMode` enum.
 *
 * The values are written out as literals rather than imported from
 * `@prisma/client`, which would pull Prisma outside src/server/ and break the
 * one-import-site rule in DESIGN.md §4. They are string literals, so Prisma's
 * generated enum type still accepts them at the mutation boundary — and the
 * test suite asserts the two lists agree, which is what stops this drifting
 * from the schema.
 */
export const WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;

export type WorkModeValue = (typeof WORK_MODES)[number];

export const WORK_MODE_LABELS: Record<WorkModeValue, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

/**
 * Narrows the `string[]` a checkbox group hands back to the enum values. The
 * group's contract is plain strings, so this is the one place that turns
 * "whatever was ticked" into something the schema and Prisma will accept.
 */
export function isWorkMode(value: string): value is WorkModeValue {
  return (WORK_MODES as readonly string[]).includes(value);
}
