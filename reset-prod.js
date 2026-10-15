const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const tables = [
    "QuoteItem","Quote","DespatchNoteItem","DespatchNote","RequestHistory","Movement",
    "ProductRequest","Return","Payment","SaleItem","Sale",
    "Notification","AuditLog",
    "PurchaseNoteItem","PurchaseNote","Cost","ProductImporter",
    "Inventory","Product",
    "Category","Importer","Customer"
  ];
  for (const t of tables) {
    try { await prisma[t].deleteMany({}); console.log("OK", t); }
    catch (e) { console.log("ERR", t, e.message.split("\n")[0]); }
  }
  await prisma.$disconnect();
})();
