-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seqId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL DEFAULT '[]',
    "expectedResult" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "template" TEXT NOT NULL DEFAULT 'STEPS',
    "testType" TEXT NOT NULL DEFAULT 'FUNCTIONAL',
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "references" TEXT NOT NULL DEFAULT '[]',
    "markedForDeletion" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "sectionId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "reviewedById" TEXT,
    "reviewComment" TEXT,
    "qaReviewedById" TEXT,
    "qaComment" TEXT,
    "poReviewedById" TEXT,
    "poComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_qaReviewedById_fkey" FOREIGN KEY ("qaReviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_poReviewedById_fkey" FOREIGN KEY ("poReviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("category", "createdAt", "createdById", "description", "expectedResult", "id", "poComment", "poReviewedById", "priority", "projectId", "qaComment", "qaReviewedById", "sectionId", "seqId", "status", "steps", "tags", "title", "updatedAt") SELECT "category", "createdAt", "createdById", "description", "expectedResult", "id", "poComment", "poReviewedById", "priority", "projectId", "qaComment", "qaReviewedById", "sectionId", "seqId", "status", "steps", "tags", "title", "updatedAt" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE UNIQUE INDEX "TestCase_seqId_key" ON "TestCase"("seqId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
