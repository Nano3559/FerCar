CREATE TABLE IF NOT EXISTS "PurchaseNote" (
  "id" SERIAL PRIMARY KEY,
  "noteNumber" TEXT NOT NULL UNIQUE,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supplierName" TEXT NOT NULL,
  "supplierNit" TEXT,
  "supplierPhone" TEXT,
  "locationId" INTEGER NOT NULL,
  "fileUrl" TEXT,
  "exchangeRate" DECIMAL(65,30),
  "expensesPer" DECIMAL(65,30),
  "totalUnits" INTEGER NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseNote_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PurchaseNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseNote_locationId_idx" ON "PurchaseNote"("locationId");

CREATE TABLE IF NOT EXISTS "PurchaseNoteItem" (
  "id" SERIAL PRIMARY KEY,
  "noteId" INTEGER NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" DECIMAL(65,30) NOT NULL,
  "price1" DECIMAL(65,30),
  "price2" DECIMAL(65,30),
  "disc20" DECIMAL(65,30),
  "disc30" DECIMAL(65,30),
  "disc40" DECIMAL(65,30),
  "disc50" DECIMAL(65,30),
  "priceD20" DECIMAL(65,30),
  "priceD30" DECIMAL(65,30),
  "priceD40" DECIMAL(65,30),
  "priceD50" DECIMAL(65,30),
  "lineTotal" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "PurchaseNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PurchaseNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "PurchaseNoteItem_noteId_idx" ON "PurchaseNoteItem"("noteId");
CREATE INDEX IF NOT EXISTS "PurchaseNoteItem_productId_idx" ON "PurchaseNoteItem"("productId");

CREATE TABLE IF NOT EXISTS "Setting" (
  "key" TEXT PRIMARY KEY,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);