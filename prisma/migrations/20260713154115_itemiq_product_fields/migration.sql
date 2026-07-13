-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "era" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "wholesalePrice" INTEGER NOT NULL,
    "estRetailLow" INTEGER NOT NULL,
    "estRetailHigh" INTEGER NOT NULL,
    "provenance" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "marks" TEXT,
    "dimensions" TEXT,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "images" TEXT NOT NULL,
    "imageLabel" TEXT NOT NULL,
    "primaryImageUrl" TEXT,
    "hostCompAvgUsd" REAL,
    "source" TEXT NOT NULL DEFAULT 'seed',
    "authenticated" BOOLEAN NOT NULL DEFAULT false,
    "authLabel" TEXT,
    "holdExpiresAt" DATETIME,
    "bundleId" TEXT,
    "soldToId" TEXT,
    "soldAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_soldToId_fkey" FOREIGN KEY ("soldToId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("bundleId", "category", "condition", "createdAt", "dimensions", "era", "estRetailHigh", "estRetailLow", "holdExpiresAt", "id", "imageLabel", "images", "location", "marks", "material", "name", "origin", "provenance", "sku", "soldAt", "soldToId", "status", "wholesalePrice") SELECT "bundleId", "category", "condition", "createdAt", "dimensions", "era", "estRetailHigh", "estRetailLow", "holdExpiresAt", "id", "imageLabel", "images", "location", "marks", "material", "name", "origin", "provenance", "sku", "soldAt", "soldToId", "status", "wholesalePrice" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
