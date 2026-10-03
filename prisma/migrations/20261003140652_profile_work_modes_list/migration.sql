/*
  `Profile.preferredWorkMode` (one optional WorkMode) becomes
  `Profile.preferredWorkModes` (a list), because "remote or hybrid, but not
  on-site" is the normal answer and a single column could not hold it.

  Hand-written rather than left as Prisma generated it. The generated version was
  a DROP COLUMN followed by an ADD COLUMN, which would have discarded every
  preference already collected; the UPDATE between the two carries each existing
  choice across as a one-element list instead.

  An empty array is "no preference", so rows that never answered need no
  backfill — the column default covers them.
*/

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "preferredWorkModes" "WorkMode"[] DEFAULT ARRAY[]::"WorkMode"[];

UPDATE "Profile"
SET "preferredWorkModes" = ARRAY["preferredWorkMode"]
WHERE "preferredWorkMode" IS NOT NULL;

ALTER TABLE "Profile" DROP COLUMN "preferredWorkMode";
