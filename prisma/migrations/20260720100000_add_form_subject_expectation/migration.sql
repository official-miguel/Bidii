-- CreateTable
CREATE TABLE "FormSubjectExpectation" (
    "id"            TEXT NOT NULL,
    "schoolId"      TEXT NOT NULL,
    "form"          INTEGER NOT NULL,
    "expectedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubjectExpectation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FormSubjectExpectation_schoolId_form_key" ON "FormSubjectExpectation"("schoolId", "form");

-- CreateIndex
CREATE INDEX "FormSubjectExpectation_schoolId_idx" ON "FormSubjectExpectation"("schoolId");

-- AddForeignKey
ALTER TABLE "FormSubjectExpectation"
    ADD CONSTRAINT "FormSubjectExpectation_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
