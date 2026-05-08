-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'SINGLE_REPO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "suiteId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Section_suiteId_fkey" FOREIGN KEY ("suiteId") REFERENCES "TestSuite" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Section_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TestCase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "steps" TEXT NOT NULL DEFAULT '[]',
    "expectedResult" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "category" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "projectId" TEXT,
    "sectionId" TEXT,
    "createdById" TEXT NOT NULL,
    "qaReviewedById" TEXT,
    "qaComment" TEXT,
    "poReviewedById" TEXT,
    "poComment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TestCase_qaReviewedById_fkey" FOREIGN KEY ("qaReviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TestCase_poReviewedById_fkey" FOREIGN KEY ("poReviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestCase" ("category", "createdAt", "createdById", "description", "expectedResult", "id", "poComment", "poReviewedById", "priority", "qaComment", "qaReviewedById", "status", "steps", "tags", "title", "updatedAt") SELECT "category", "createdAt", "createdById", "description", "expectedResult", "id", "poComment", "poReviewedById", "priority", "qaComment", "qaReviewedById", "status", "steps", "tags", "title", "updatedAt" FROM "TestCase";
DROP TABLE "TestCase";
ALTER TABLE "new_TestCase" RENAME TO "TestCase";
CREATE TABLE "new_TestPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT NOT NULL DEFAULT 'QA',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" DATETIME,
    "endDate" DATETIME,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TestPlan" ("createdAt", "description", "endDate", "environment", "id", "name", "startDate", "status", "updatedAt") SELECT "createdAt", "description", "endDate", "environment", "id", "name", "startDate", "status", "updatedAt" FROM "TestPlan";
DROP TABLE "TestPlan";
ALTER TABLE "new_TestPlan" RENAME TO "TestPlan";
CREATE TABLE "new_TestSuite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TestSuite_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TestSuite" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "TestSuite";
DROP TABLE "TestSuite";
ALTER TABLE "new_TestSuite" RENAME TO "TestSuite";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
