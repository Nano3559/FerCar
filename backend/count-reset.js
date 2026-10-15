require("dotenv").config({ path: ".env.production" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const models = ["RoleModel","User","Location","Category","Product","Inventory","Customer","Supplier","Manufacturer","Importer","ProductImporter","Cost","Sale","SaleItem","Payment","Return","Movement","ProductRequest","RequestHistory","DespatchNote","DespatchNoteItem","Quote","QuoteItem","PurchaseNote","PurchaseNoteItem","Notification","AuditLog","Setting"];
(async () => {
  for (const m of models) {
    try { const c = await prisma[m].count(); console.log(m.padEnd(18), c); }
    catch (e) { console.log(m.padEnd(18), "ERR", e.message.split("\n")[0]); }
  }
  await prisma.$disconnect();
})();
