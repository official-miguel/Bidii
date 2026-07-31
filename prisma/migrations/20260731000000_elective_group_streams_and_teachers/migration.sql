-- Migration: elective_group_streams_and_teachers
-- 1. Add scopeStreams column to ElectiveGroup (empty array = all streams)
ALTER TABLE "ElectiveGroup" ADD COLUMN "scopeStreams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 2. Create ElectiveGroupTeacher table
CREATE TABLE "ElectiveGroupTeacher" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectiveGroupTeacher_pkey" PRIMARY KEY ("id")
);

-- 3. Unique constraint: a teacher can only appear once per (group, subject) pair
CREATE UNIQUE INDEX "ElectiveGroupTeacher_groupId_subjectId_teacherId_key"
    ON "ElectiveGroupTeacher"("groupId", "subjectId", "teacherId");

-- 4. Indexes
CREATE INDEX "ElectiveGroupTeacher_groupId_idx"    ON "ElectiveGroupTeacher"("groupId");
CREATE INDEX "ElectiveGroupTeacher_subjectId_idx"  ON "ElectiveGroupTeacher"("subjectId");
CREATE INDEX "ElectiveGroupTeacher_teacherId_idx"  ON "ElectiveGroupTeacher"("teacherId");
CREATE INDEX "ElectiveGroupTeacher_schoolId_idx"   ON "ElectiveGroupTeacher"("schoolId");

-- 5. Foreign keys
ALTER TABLE "ElectiveGroupTeacher"
    ADD CONSTRAINT "ElectiveGroupTeacher_groupId_fkey"
        FOREIGN KEY ("groupId")   REFERENCES "ElectiveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectiveGroupTeacher"
    ADD CONSTRAINT "ElectiveGroupTeacher_subjectId_fkey"
        FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")       ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectiveGroupTeacher"
    ADD CONSTRAINT "ElectiveGroupTeacher_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")       ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ElectiveGroupTeacher"
    ADD CONSTRAINT "ElectiveGroupTeacher_schoolId_fkey"
        FOREIGN KEY ("schoolId")  REFERENCES "School"("id")        ON DELETE CASCADE ON UPDATE CASCADE;
