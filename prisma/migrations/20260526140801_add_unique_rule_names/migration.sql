/*
  Warnings:

  - A unique constraint covering the columns `[shop,name]` on the table `SortingRule` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE INDEX "SortingRule_shop_rule_idx" ON "SortingRule"("shop", "rule");

-- CreateIndex
CREATE UNIQUE INDEX "SortingRule_shop_name_key" ON "SortingRule"("shop", "name");
