-- AlterTable
ALTER TABLE "SortingRule" ADD COLUMN "lastRunAt" DATETIME;
ALTER TABLE "SortingRule" ADD COLUMN "nextRunAt" DATETIME;

-- CreateTable
CREATE TABLE "RuleExecutionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sortingRuleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuleExecutionLog_sortingRuleId_fkey" FOREIGN KEY ("sortingRuleId") REFERENCES "SortingRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RuleExecutionLog_sortingRuleId_idx" ON "RuleExecutionLog"("sortingRuleId");
