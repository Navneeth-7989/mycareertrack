-- DropIndex
DROP INDEX "application_jobtitle_trgm";

-- DropIndex
DROP INDEX "application_location_trgm";

-- DropIndex
DROP INDEX "company_name_trgm";

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "fieldOfStudy" TEXT;
