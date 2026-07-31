-- CreateTable
-- ClassElectiveGroupTeacher: per-class teacher–subject pairings within an
-- elective group. Unlike ElectiveGroupTeacher (form-wide), each row here
-- belongs to a specific stream/class, so different classes in the same form
-- can have different teachers for the same subject in the same group.
CREATE TABLE "ClassElectiveGroupTeacher" (
    "id"        TEXT NOT NULL,
    "groupId"   TEXT NOT NULL,
    "classId"   TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "schoolId"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassElectiveGroupTeacher_pkey" PRIMARY KEY ("id")
);

-- Unique: a teacher can only be assigned once per (group, class, subject)
CREATE UNIQUE INDEX "ClassElectiveGroupTeacher_groupId_classId_subjectId_teacherId_key"
    ON "ClassElectiveGroupTeacher"("groupId", "classId", "subjectId", "teacherId");

-- Supporting indexes
CREATE INDEX "ClassElectiveGroupTeacher_groupId_idx"   ON "ClassElectiveGroupTeacher"("groupId");
CREATE INDEX "ClassElectiveGroupTeacher_classId_idx"   ON "ClassElectiveGroupTeacher"("classId");
CREATE INDEX "ClassElectiveGroupTeacher_subjectId_idx" ON "ClassElectiveGroupTeacher"("subjectId");
CREATE INDEX "ClassElectiveGroupTeacher_teacherId_idx" ON "ClassElectiveGroupTeacher"("teacherId");
CREATE INDEX "ClassElectiveGroupTeacher_schoolId_idx"  ON "ClassElectiveGroupTeacher"("schoolId");

-- Foreign keys (cascade from parent side, restrict on teacher/subject to prevent orphans)
ALTER TABLE "ClassElectiveGroupTeacher"
    ADD CONSTRAINT "ClassElectiveGroupTeacher_groupId_fkey"
        FOREIGN KEY ("groupId")   REFERENCES "ElectiveGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassElectiveGroupTeacher"
    ADD CONSTRAINT "ClassElectiveGroupTeacher_classId_fkey"
        FOREIGN KEY ("classId")   REFERENCES "SchoolClass"("id")   ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassElectiveGroupTeacher"
    ADD CONSTRAINT "ClassElectiveGroupTeacher_subjectId_fkey"
        FOREIGN KEY ("subjectId") REFERENCES "Subject"("id")       ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassElectiveGroupTeacher"
    ADD CONSTRAINT "ClassElectiveGroupTeacher_teacherId_fkey"
        FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id")       ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassElectiveGroupTeacher"
    ADD CONSTRAINT "ClassElectiveGroupTeacher_schoolId_fkey"
        FOREIGN KEY ("schoolId")  REFERENCES "School"("id")        ON DELETE CASCADE ON UPDATE CASCADE;
